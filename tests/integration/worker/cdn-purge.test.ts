import http from "node:http";
import type { AddressInfo } from "node:net";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAccountEvent } from "@/server/accounts/apply-account-event";
import { resetZoneCacheForTests } from "@/server/cdn/cloudflare";
import { runNextCdnPurge } from "@/server/cdn/purge-runner";
import { resetConfigForTests } from "@/server/config/env";
import { mediaKeys } from "@/server/media/keys";
import { removePost } from "@/server/moderation/admin";
import { setPostVisibility } from "@/server/posts/set-visibility";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif, smallPngWithAlpha } from "../../helpers/media-fixtures";
import { deleteAs, publishAs, uploadAs } from "../../helpers/publish";

/** F22: content taken offline is purged from the Cloudflare edge (fake Cloudflare API). */
const TOKEN = "t".repeat(40);
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let server: http.Server;
let failing = false;
const purged: string[][] = [];
const auths = new Set<string>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    auths.add(String(req.headers.authorization));
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url!, "http://x");
      let body: unknown = { success: true, result: [] };
      if (url.pathname.endsWith("/zones")) body = { success: true, result: url.searchParams.get("name") === "test.example" ? [{ id: "zone-1", name: "test.example" }] : [] };
      else if (url.pathname.endsWith("/zones/zone-1/purge_cache")) {
        if (failing) body = { success: false, errors: [{ code: 1, message: "injected" }] };
        else {
          purged.push((JSON.parse(Buffer.concat(chunks).toString()) as { files: string[] }).files);
          body = { success: true, result: { id: "p" } };
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, {
    CLOUDFLARE_PURGE_TOKEN: TOKEN,
    CLOUDFLARE_API_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/client/v4`,
    PUBLIC_BASE_URL: "https://site.test.example",
    MEDIA_PUBLIC_BASE_URL: "https://media.test.example",
  });
  ctx = await startAppContext();
});
afterAll(async () => {
  for (const k of ["CLOUDFLARE_PURGE_TOKEN", "CLOUDFLARE_API_URL", "PUBLIC_BASE_URL", "MEDIA_PUBLIC_BASE_URL"]) delete process.env[k];
  resetConfigForTests();
  await ctx?.stop();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(async () => {
  await ctx.db.deleteFrom("cdn_purge").execute();
  purged.length = 0;
  failing = false;
  resetZoneCacheForTests();
});

const drain = async () => {
  while (await runNextCdnPurge(ctx.db));
};
const queued = async () => (await ctx.db.selectFrom("cdn_purge").select("url").execute()).map((r) => r.url).sort();

describe("CDN purge (F22)", () => {
  it("deleting a post purges its share cards and its media; the token is sent as a bearer", async () => {
    const mediaId = await uploadAs(ctx, "cdn-user", await jpegWithExif());
    const post = await publishAs(ctx, "cdn-user", { version: 1, blocks: [{ type: "image", mediaId }] });
    expect(await queued()).toEqual([]);
    await deleteAs(ctx, post.id);
    const media = await ctx.db.selectFrom("media").selectAll().where("id", "=", mediaId).executeTakeFirstOrThrow();
    const expected = [
      ...mediaKeys(media).map((k) => `https://media.test.example/${k}`),
      `https://site.test.example/p/${post.slug}/og/square.jpg`,
      `https://site.test.example/p/${post.slug}/og/wide.jpg`,
    ].sort();
    expect(await queued()).toEqual(expected);
    await drain();
    expect(purged.flat().sort()).toEqual(expected);
    expect(await queued()).toEqual([]);
    expect(auths.has(`Bearer ${TOKEN}`)).toBe(true);
  });

  it("a failed purge is retried later; after 24 hours it is dropped", async () => {
    const post = await publishAs(ctx, "cdn-user", { version: 1, blocks: [{ type: "text", text: "x" }] });
    await removePost({ db: ctx.db, stores: ctx.stores, cacheControl: "x", retentionDays: 30 }, { actorId: "ops", reason: "t" }, post.slug);
    failing = true;
    await drain();
    const rows = await ctx.db.selectFrom("cdn_purge").selectAll().execute();
    expect(rows).toHaveLength(2);
    for (const r of rows) expect([r.attempts, r.run_after.getTime() > Date.now() + 30_000, r.last_error?.includes("injected")]).toEqual([1, true, true]);
    await ctx.db.updateTable("cdn_purge").set({ run_after: sql<Date>`now()` }).execute();
    failing = false;
    await drain();
    expect(purged.flat()).toHaveLength(2);
    // Older than the retry window: dropped after the failing attempt.
    const late = await publishAs(ctx, "cdn-user", { version: 1, blocks: [{ type: "text", text: "late" }] });
    await deleteAs(ctx, late.id);
    await ctx.db.updateTable("cdn_purge").set({ created_at: sql<Date>`now() - interval '25 hours'` } as never).execute();
    failing = true;
    await drain();
    expect(await queued()).toEqual([]);
  });

  it("an account entering cooling-off or deleted purges its cards and media", async () => {
    const mediaId = await uploadAs(ctx, "cdn-leaving", await jpegWithExif());
    const post = await publishAs(ctx, "cdn-leaving", { version: 1, blocks: [{ type: "image", mediaId }] });
    const rt = { db: ctx.db, stores: ctx.stores, cacheControl: "x" };
    await applyAccountEvent(rt, { eventId: "cdn-leaving-req", event: "deletion_requested", userId: "cdn-leaving", occurredAt: new Date().toISOString() });
    const urls = await queued();
    expect(urls).toContain(`https://site.test.example/p/${post.slug}/og/wide.jpg`);
    expect(urls.filter((u) => u.startsWith("https://media.test.example/")).length).toBeGreaterThan(0);
    await drain();
    await applyAccountEvent(rt, { eventId: "cdn-leaving-del", event: "deletion_completed", userId: "cdn-leaving", occurredAt: new Date().toISOString() });
    expect(await queued()).toContain(`https://site.test.example/p/${post.slug}/og/wide.jpg`);
  });

  it("a post made private purges cards and media; public again purges the media's cached 404s", async () => {
    const mediaId = await uploadAs(ctx, "cdn-user", await smallPngWithAlpha());
    const post = await publishAs(ctx, "cdn-user", { version: 1, blocks: [{ type: "image", mediaId }] });
    const rt = { db: ctx.db, stores: ctx.stores, cacheControl: "x" };
    const media = await ctx.db.selectFrom("media").selectAll().where("id", "=", mediaId).executeTakeFirstOrThrow();
    const mediaUrls = mediaKeys(media).map((k) => `https://media.test.example/${k}`).sort();
    await setPostVisibility(rt, post.id, "private");
    expect(await queued()).toEqual([...mediaUrls, `https://site.test.example/p/${post.slug}/og/square.jpg`, `https://site.test.example/p/${post.slug}/og/wide.jpg`].sort());
    await drain();
    await setPostVisibility(rt, post.id, "public");
    expect(await queued()).toEqual(mediaUrls);
  });

  it("nothing is queued without a token", async () => {
    delete process.env.CLOUDFLARE_PURGE_TOKEN;
    resetConfigForTests();
    try {
      const post = await publishAs(ctx, "cdn-user", { version: 1, blocks: [{ type: "text", text: "no token" }] });
      await deleteAs(ctx, post.id);
      expect(await queued()).toEqual([]);
      expect(await runNextCdnPurge(ctx.db)).toBe(false);
    } finally {
      process.env.CLOUDFLARE_PURGE_TOKEN = TOKEN;
      resetConfigForTests();
    }
  });
});
