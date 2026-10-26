import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as visibilityRoute } from "@/app/api/web/posts/visibility/route";
import { POST as likeRoute } from "@/app/api/v1/p/[slug]/like/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as mediaRoute } from "@/app/p/[slug]/media/[...key]/route";
import { GET as ogRoute } from "@/app/p/[slug]/og/[variant]/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { GET as profileRoute } from "@/app/u/[handle]/route";
import { startSession } from "@/server/auth/web/session";
import { findMediaByIds } from "@/server/db/repos/media";
import { mediaKeys } from "@/server/media/keys";
import { pushShareContent } from "@/server/nicenote/push-content";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import type { LocalStore } from "@/server/storage/local-store";
import { jsonRequest, params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif, smallPngWithAlpha } from "../../helpers/media-fixtures";
import { deleteAs, publishAs, shareFromNiceNote, uploadAs } from "../../helpers/publish";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let author: string;
let stranger: string;
let handle: string;
beforeAll(async () => {
  ctx = await startAppContext();
  handle = (await ensureProfile(ctx.db, "priv-author")).handle;
  await ensureProfile(ctx.db, "priv-stranger");
  author = (await startSession(ctx.db, "priv-author")).split(";")[0];
  stranger = (await startSession(ctx.db, "priv-stranger")).split(";")[0];
});
afterAll(async () => ctx?.stop());

const view = async (slug: string, cookie = "") => {
  const res = await pageRoute(new Request(`${BASE}/p/${slug}`, { headers: { cookie, "accept-language": "en" } }), params({ slug }));
  return { status: res.status, html: await res.text() };
};
const setVisibility = (slug: string, visibility: string, cookie = author) =>
  visibilityRoute(new Request(`${BASE}/api/web/posts/visibility`, {
    method: "POST",
    body: new URLSearchParams({ slug, visibility, back: `/p/${slug}` }),
    headers: { origin: BASE, cookie, "content-type": "application/x-www-form-urlencoded" },
  }));
const media = (slug: string, key: string, cookie = author, range?: string) =>
  mediaRoute(new Request(`${BASE}/p/${slug}/media/${key}`, { headers: { cookie, ...(range ? { range } : {}) } }), { params: Promise.resolve({ slug, key: key.split("/") }) });
const listing = async (route: "discover" | "profile", cookie = "") => {
  const headers = { "accept-language": "en", cookie };
  const res = route === "discover" ? await discoverRoute(new Request(`${BASE}/discover`, { headers })) : await profileRoute(new Request(`${BASE}/u/${handle}`, { headers }), params({ handle }));
  return res.text();
};
const inPublicStore = (key: string) => existsSync((ctx.stores.publicStore as LocalStore).resolve(key));
const postRow = (id: string) => ctx.db.selectFrom("post").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

describe("private posts", () => {
  it("only the author sees a private post: others get 404 everywhere, media leave the public store", async () => {
    const mediaId = await uploadAs(ctx, "priv-author", await jpegWithExif());
    const post = await publishAs(ctx, "priv-author", { version: 1, blocks: [{ type: "text", text: "Secret thought" }, { type: "image", mediaId }] });
    const [m] = await findMediaByIds(ctx.db, [mediaId]);
    const key = mediaKeys(m)[0];
    expect(inPublicStore(key)).toBe(true);
    expect((await listing("discover")).includes(post.slug)).toBe(true);

    // Only the author, same origin.
    expect((await setVisibility(post.slug, "private", stranger)).headers.get("location")).toBe(`/p/${post.slug}?n=visibility_failed`);
    const ok = await setVisibility(post.slug, "private");
    expect([ok.status, ok.headers.get("location")]).toEqual([303, `/p/${post.slug}`]);
    expect((await postRow(post.id)).visibility).toBe("private");
    expect(inPublicStore(key)).toBe(false);

    for (const cookie of ["", stranger]) {
      const other = await view(post.slug, cookie);
      expect(other.status).toBe(404);
      expect(other.html).not.toContain("Secret thought");
    }
    expect((await ogRoute(new Request(`${BASE}/p/${post.slug}/og/wide.jpg`), params({ slug: post.slug, variant: "wide.jpg" }))).status).toBe(404);
    expect((await likeRoute(jsonRequest("POST", "/x", null, undefined, { origin: BASE }), params({ slug: post.slug }))).status).toBe(404);
    expect((await listing("discover")).includes(post.slug)).toBe(false);
    expect((await listing("profile", stranger)).includes(post.slug)).toBe(false);

    const own = await view(post.slug, author);
    expect(own.status).toBe(200);
    expect(own.html).toContain("Secret thought");
    expect(own.html).toContain('class="ni-private-note"');
    expect(own.html).toContain('<meta name="robots" content="noindex">');
    expect(own.html).not.toContain('property="og:image"');
    expect(own.html).toContain(`/p/${post.slug}/media/${key}`);
    expect(own.html).not.toContain('data-like="post"');
    expect(own.html).toContain("Make public");
    const profile = await listing("profile", author);
    expect(profile).toContain(post.slug);
    expect(profile).toContain('class="ni-private"');

    // Author-only media from the private store, with byte ranges.
    const full = await media(post.slug, key);
    expect(full.status).toBe(200);
    expect(full.headers.get("cache-control")).toBe("private, max-age=300");
    const size = Number(full.headers.get("content-length"));
    expect((await full.arrayBuffer()).byteLength).toBe(size);
    const part = await media(post.slug, key, author, "bytes=0-9");
    expect([part.status, part.headers.get("content-range"), (await part.arrayBuffer()).byteLength]).toEqual([206, `bytes 0-9/${size}`, 10]);
    expect((await media(post.slug, key, author, `bytes=${size + 5}-`)).status).toBe(416);
    expect((await media(post.slug, key, stranger)).status).toBe(404);
    expect((await media(post.slug, key, "")).status).toBe(404);
    expect((await media(post.slug, "m/../etc/passwd")).status).toBe(404);
  });

  it("making it public again brings the page, media and listings back", async () => {
    const mediaId = await uploadAs(ctx, "priv-author", await jpegWithExif());
    const post = await publishAs(ctx, "priv-author", { version: 1, blocks: [{ type: "text", text: "Back again" }, { type: "image", mediaId }] });
    const key = mediaKeys((await findMediaByIds(ctx.db, [mediaId]))[0])[0];
    await setVisibility(post.slug, "private");
    expect(inPublicStore(key)).toBe(false);
    expect((await setVisibility(post.slug, "public")).status).toBe(303);
    expect(inPublicStore(key)).toBe(true);
    const back = await view(post.slug, stranger);
    expect(back.status).toBe(200);
    expect(back.html).not.toContain("ni-private-note");
    expect((await listing("discover")).includes(post.slug)).toBe(true);
    // Public media of the author's own post redirect to the public domain.
    expect((await media(post.slug, key)).status).toBe(302);
  });

  it("NiceNote shares: the web change tells the backend; app pushes keep a private post's media private", async () => {
    const shared = await shareFromNiceNote(ctx, "priv-author", { version: 1, blocks: [{ type: "text", text: "From the app" }] });
    await setVisibility(shared.slug, "private");
    const events = await ctx.db.selectFrom("outbox").select("payload").where("kind", "=", "post_event").execute();
    expect(events.map((e) => e.payload)).toContainEqual(expect.objectContaining({ postId: shared.id, event: "visibility_changed", details: { visibility: "private" } }));

    // Another image than the other tests (same bytes = same stored media, public through their posts).
    const mediaId = await uploadAs(ctx, "priv-author", await smallPngWithAlpha(), "ref-private-1");
    const key = mediaKeys((await findMediaByIds(ctx.db, [mediaId]))[0])[0];
    const doc = { version: 1, blocks: [{ type: "text", text: "Updated" }, { type: "image", state: "ready", ref: "ref-private-1", mime: "image/png", bytes: 100 }] };
    const pushed = await pushShareContent(ctx.db, ctx.stores, "public, max-age=60", shared.id, { sourceRevision: 2, document: doc as never, media: {} });
    expect(pushed.changed).toBe(true);
    expect((await postRow(shared.id)).visibility).toBe("private");
    expect(inPublicStore(key)).toBe(false);
    expect((await view(shared.slug)).status).toBe(404);
  });

  it("a deleted private post stays nonexistent (404, not 410)", async () => {
    const post = await publishAs(ctx, "priv-author", { version: 1, blocks: [{ type: "text", text: "Gone quietly" }] });
    await setVisibility(post.slug, "private");
    await deleteAs(ctx, post.id);
    expect((await view(post.slug)).status).toBe(404);
    expect((await setVisibility(post.slug, "public")).headers.get("location")).toBe(`/p/${post.slug}?n=visibility_failed`);
  });
});
