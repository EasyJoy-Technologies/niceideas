import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAccountEvent } from "@/server/accounts/apply-account-event";
import { resetConfigForTests } from "@/server/config/env";
import { recordUpload } from "@/server/db/repos/media-uploads";
import { runMaintenance } from "@/server/maintenance/run-maintenance";
import { mediaKeys } from "@/server/media/keys";
import { auditPublicMedia } from "@/server/media/public-audit";
import { runVisibilityChecks } from "@/server/media/visibility";
import { createShare } from "@/server/nicenote/create-share";
import { chunkRefs, queueMediaEvents } from "@/server/nicenote/post-events";
import { pushShareContent } from "@/server/nicenote/push-content";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { runNextMediaJob } from "@/server/worker/media-job-runner";
import { startAppContext } from "../../helpers/app-context";
import { startFakeBackend } from "../../helpers/fake-backend";
import { jpegWithExif, smallPngWithAlpha } from "../../helpers/media-fixtures";
import { publishAs, uploadAs } from "../../helpers/publish";

/** Sharing review S2 (plan docs/plan/2026-10-26-share-review-fixes.md): F06, F12, F15, F19, F20. */
const KEY = "r".repeat(40);
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let backend: Awaited<ReturnType<typeof startFakeBackend>>;
beforeAll(async () => {
  const png = await smallPngWithAlpha();
  backend = await startFakeBackend(KEY, (path) => (path.includes("/media/") ? { status: 200, body: png, headers: { "content-type": "image/png" } } : { status: 200, body: "{}" }));
  Object.assign(process.env, { NICEMATRIX_SHARE_KEY: KEY, NICEMATRIX_API_URL: backend.base });
  ctx = await startAppContext();
});
afterAll(async () => {
  delete process.env.NICEMATRIX_SHARE_KEY;
  delete process.env.NICEMATRIX_API_URL;
  resetConfigForTests();
  await ctx?.stop();
  await backend?.stop();
});

const CACHE = "no-store";
const vis = () => ({ db: ctx.db, stores: ctx.stores, cacheControl: CACHE });
const mediaRow = (id: string) => ctx.db.selectFrom("media").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const inPublic = async (id: string) => ctx.stores.publicStore.exists(mediaKeys(await mediaRow(id))[0]);

describe("F06: the worker settles media left due", () => {
  it("a withdrawal whose move failed is finished by the worker", async () => {
    const mediaId = await uploadAs(ctx, "rel-vis", await jpegWithExif());
    await publishAs(ctx, "rel-vis", { version: 1, blocks: [{ type: "image", mediaId }] });
    expect(await inPublic(mediaId)).toBe(true);
    // The request's own check fails (storage error): the media stays due.
    const move = ctx.stores.publicStore.copyTo.bind(ctx.stores.publicStore);
    ctx.stores.publicStore.copyTo = async () => {
      throw new Error("injected storage failure");
    };
    try {
      await ctx.db.updateTable("post").set({ status: "unpublished" }).where("author_id", "=", "rel-vis").execute();
      await ctx.db.updateTable("media").set({ visibility_due_at: sql<Date>`now()` }).where("id", "=", mediaId).execute();
      expect(await runVisibilityChecks(vis())).toBe(false);
    } finally {
      ctx.stores.publicStore.copyTo = move;
    }
    expect(await inPublic(mediaId)).toBe(true);
    expect((await mediaRow(mediaId)).visibility_due_at!.getTime()).toBeGreaterThan(Date.now());
    await ctx.db.updateTable("media").set({ visibility_due_at: sql<Date>`now()` }).where("id", "=", mediaId).execute();
    expect(await runVisibilityChecks(vis())).toBe(true);
    expect(await inPublic(mediaId)).toBe(false);
    expect(await mediaRow(mediaId)).toMatchObject({ public_at: null, visibility_due_at: null });
  });
});

describe("F12: a share refresh survives a failure after its media job settled", () => {
  it("is retried by the worker until the share shows the media", async () => {
    const user = "rel-refresh";
    const { post } = await createShare(ctx.db, { shareId: randomUUID(), userId: user, region: "intl", syncMode: "follow", commentsMode: null, profile: null, sourceApp: null });
    const ref = randomUUID();
    const doc = { version: 1, blocks: [{ type: "image", state: "ready", ref, mime: "image/png", bytes: 10 }] };
    await pushShareContent(ctx.db, ctx.stores, CACHE, post.id, { sourceRevision: 1, document: doc as never, media: { [ref]: { url: `${backend.base}/v1/internal/niceideas/media/one` } } as never });
    const rt = { ...vis(), key: KEY, maxBytes: 10_000_000, maxImagePixels: 100_000_000 };
    await sql`CREATE FUNCTION rel_refuse_post_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected post refresh failure'; END; $$`.execute(ctx.db);
    await sql`CREATE TRIGGER rel_refuse_post_update BEFORE UPDATE ON post FOR EACH ROW EXECUTE FUNCTION rel_refuse_post_update()`.execute(ctx.db);
    try {
      expect(await runNextMediaJob(rt, new AbortController().signal)).toBe(true);
    } finally {
      await sql`DROP TRIGGER rel_refuse_post_update ON post`.execute(ctx.db);
      await sql`DROP FUNCTION rel_refuse_post_update()`.execute(ctx.db);
    }
    const job = await ctx.db.selectFrom("media_job").selectAll().where("owner_id", "=", user).executeTakeFirstOrThrow();
    expect(job.state).toBe("done");
    expect(job.refresh_due_at).not.toBeNull();
    expect((await ctx.db.selectFrom("post").select("media_state").where("id", "=", post.id).executeTakeFirstOrThrow()).media_state).toBe("processing");
    await ctx.db.updateTable("media_job").set({ refresh_due_at: sql<Date>`now()` }).where("owner_id", "=", user).execute();
    expect(await runNextMediaJob(rt, new AbortController().signal)).toBe(true);
    expect((await ctx.db.selectFrom("post").select("media_state").where("id", "=", post.id).executeTakeFirstOrThrow()).media_state).toBe("complete");
    expect((await ctx.db.selectFrom("media_job").select("refresh_due_at").where("owner_id", "=", user).executeTakeFirstOrThrow()).refresh_due_at).toBeNull();
  });
});

describe("F15: media_failed events fit one backend request", () => {
  it("splits refs by serialized size", async () => {
    const refs = Array.from({ length: 250 }, () => randomUUID());
    const chunks = chunkRefs(refs, "fetch_failed");
    expect(chunks.flat()).toEqual(refs);
    expect(chunks.length).toBeGreaterThan(1);
    const user = "rel-events";
    await ensureProfile(ctx.db, user);
    const post = { id: randomUUID(), source: "nicenote" as const, share_id: randomUUID(), status: "active" as const, media_state: "partial" as const };
    await queueMediaEvents(ctx.db, post, { before: "partial", failed: refs.map((ref) => ({ ref, reason: "fetch_failed" })) });
    const rows = await ctx.db.selectFrom("outbox").select("payload").where("kind", "=", "post_event").execute();
    const mine = rows.map((r) => r.payload as { postId: string; details: { refs: string[] } }).filter((p) => p.postId === post.id);
    expect(mine.flatMap((p) => p.details.refs).sort()).toEqual([...refs].sort());
    for (const p of mine) expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(7000);
  });
});

describe("F20: objects of uploads that never got their media row are removed", () => {
  it("by the daily maintenance after 24 hours, and by the account deletion", async () => {
    const user = "rel-upload";
    await ensureProfile(ctx.db, user);
    const stale = `m/${randomUUID()}`;
    const fresh = `m/${randomUUID()}`;
    for (const prefix of [stale, fresh]) {
      await recordUpload(ctx.db, prefix, user);
      await ctx.stores.privateStore.putBuffer(`${prefix}/w480.webp`, Buffer.from("x"));
    }
    await ctx.db.updateTable("media_upload").set({ created_at: new Date(Date.now() - 25 * 3_600_000) } as never).where("prefix", "=", stale).execute();
    expect((await runMaintenance(ctx.db, ctx.stores)).uploadsCleaned).toBe(1);
    expect(await ctx.stores.privateStore.exists(`${stale}/w480.webp`)).toBe(false);
    expect(await ctx.stores.privateStore.exists(`${fresh}/w480.webp`)).toBe(true);
    expect(await applyAccountEvent(vis(), { eventId: "rel-upload-del", event: "deletion_completed", userId: user, occurredAt: new Date().toISOString() })).toBe("applied");
    expect(await ctx.stores.privateStore.exists(`${fresh}/w480.webp`)).toBe(false);
  });
});

describe("F19: a new profile and its backend registration are written together", () => {
  it("queues user_registered exactly once with the profile", async () => {
    await ensureProfile(ctx.db, "rel-new-user");
    await ensureProfile(ctx.db, "rel-new-user");
    const rows = await ctx.db.selectFrom("outbox").select("dedupe_key").where("dedupe_key", "=", "user_registered:rel-new-user").execute();
    expect(rows).toHaveLength(1);
  });
});

describe("F06: read-only inventory of the public store", () => {
  it("reports public objects the database does not know as public", async () => {
    const mediaId = await uploadAs(ctx, "rel-audit", await jpegWithExif(), undefined);
    const key = mediaKeys(await mediaRow(mediaId))[0];
    await ctx.stores.privateStore.copyTo(ctx.stores.publicStore, key);
    await ctx.stores.publicStore.putBuffer("m/unknown-object/x.webp", Buffer.from("x"));
    const audit = await auditPublicMedia(ctx.db, ctx.stores);
    expect(audit.strayMedia).toContain(mediaId);
    expect(audit.unknownKeys).toContain("m/unknown-object/x.webp");
    await ctx.stores.publicStore.deleteMany([key, "m/unknown-object/x.webp"]);
  });
});
