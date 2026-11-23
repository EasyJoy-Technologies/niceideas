import { existsSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as bookmarkRoute } from "@/app/api/v1/p/[slug]/bookmark/route";
import { POST as commentRoute } from "@/app/api/v1/p/[slug]/comments/route";
import { POST as likeRoute } from "@/app/api/v1/p/[slug]/like/route";
import { POST as composeRoute } from "@/app/api/web/compose/route";
import { POST as repostRoute } from "@/app/api/web/posts/repost/route";
import { POST as visibilityRoute } from "@/app/api/web/posts/visibility/route";
import { GET as bookmarksPage } from "@/app/bookmarks/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as mediaRoute } from "@/app/p/[slug]/media/[...key]/route";
import { GET as ogRoute } from "@/app/p/[slug]/og/[variant]/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { GET as homeRoute } from "@/app/route";
import { GET as profileRoute } from "@/app/u/[handle]/route";
import { startSession } from "@/server/auth/web/session";
import { setFollow } from "@/server/db/repos/follows";
import { findMediaByIds } from "@/server/db/repos/media";
import { listNotifications } from "@/server/db/repos/notifications";
import { mediaKeys } from "@/server/media/keys";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import type { LocalStore } from "@/server/storage/local-store";
import { jsonRequest, params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { publishAs, uploadAs } from "../../helpers/publish";

/** "Anyone with the link" posts (plan docs/plan/2026-11-23-link-visibility.md). */
const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
const cookie: Record<string, string> = {};
const handle: Record<string, string> = {};
const USERS = ["lnk-author", "lnk-fan", "lnk-stranger"] as const;

beforeAll(async () => {
  ctx = await startAppContext();
  for (const id of USERS) {
    handle[id] = (await ensureProfile(ctx.db, id)).handle;
    cookie[id] = (await startSession(ctx.db, id)).split(";")[0];
  }
  await setFollow(ctx.db, "lnk-fan", "lnk-author", true);
});
afterAll(async () => ctx?.stop());

const req = (url: string, c = "") => new Request(`${BASE}${url}`, { headers: { "accept-language": "en", cookie: `ni_sso=1${c ? `; ${c}` : ""}` } });
const view = async (slug: string, c = "") => {
  const res = await pageRoute(req(`/p/${slug}`, c), params({ slug }));
  return { status: res.status, html: await res.text() };
};
const setVisibility = (slug: string, visibility: string) =>
  visibilityRoute(new Request(`${BASE}/api/web/posts/visibility`, {
    method: "POST",
    body: new URLSearchParams({ slug, visibility, back: `/p/${slug}` }),
    headers: { origin: BASE, cookie: cookie["lnk-author"], "content-type": "application/x-www-form-urlencoded" },
  }));
const media = (slug: string, key: string, c: string) => mediaRoute(new Request(`${BASE}/p/${slug}/media/${key}`, { headers: { cookie: c } }), { params: Promise.resolve({ slug, key: key.split("/") }) });
const og = (slug: string) => ogRoute(req(`/p/${slug}/og/wide.jpg`), params({ slug, variant: "wide.jpg" }));
const write = (c: string, body?: unknown) => jsonRequest("POST", "/x", null, body, { origin: BASE, cookie: c });
const home = async (c: string) => (await homeRoute(req("/", c))).text();
const profile = async (c: string) => (await profileRoute(req(`/u/${handle["lnk-author"]}`, c), params({ handle: handle["lnk-author"] }))).text();
const discover = async () => (await discoverRoute(req("/discover"))).text();
const inPublicStore = (key: string) => existsSync((ctx.stores.publicStore as LocalStore).resolve(key));
const postsCount = (html: string) => html.match(/<b>(\d+)<\/b> Posts/)?.[1];
function repost(slug: string, c: string) {
  const form = new FormData();
  form.set("slug", slug);
  form.set("on", "1");
  form.set("back", "/");
  return repostRoute(new Request(`${BASE}/api/web/posts/repost`, { method: "POST", body: form, headers: { origin: BASE, cookie: c, accept: "application/json" } }));
}
const png = (color: string) => sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer();

describe("posts for anyone with the link", () => {
  it("opens for everyone with the link, signed out too; listed only on the author's own profile", async () => {
    const mediaId = await uploadAs(ctx, "lnk-author", await png("#cc3344"));
    const post = await publishAs(ctx, "lnk-author", { version: 1, blocks: [{ type: "text", text: "Just for those I send it to" }, { type: "image", mediaId }] });
    const key = mediaKeys((await findMediaByIds(ctx.db, [mediaId]))[0])[0];
    const before = postsCount(await profile(cookie["lnk-stranger"]));
    expect((await setVisibility(post.slug, "link")).headers.get("location")).toBe(`/p/${post.slug}`);
    // Media leave the public store (only public posts keep theirs there).
    expect(inPublicStore(key)).toBe(false);

    for (const c of ["", cookie["lnk-stranger"], cookie["lnk-fan"], cookie["lnk-author"]]) {
      const seen = await view(post.slug, c);
      expect(seen.status).toBe(200);
      expect(seen.html).toContain("Just for those I send it to");
      expect(seen.html).toContain("This post isn&#39;t listed anywhere. Only people with the link can see it.");
      // Chat previews: the card, but never indexed and no canonical.
      expect(seen.html).toContain('<meta name="robots" content="noindex">');
      expect(seen.html).toContain('property="og:image"');
      expect(seen.html).not.toContain('rel="canonical"');
      expect(seen.html).not.toContain("data-repost-menu=");
      expect(seen.html).toContain(`/p/${post.slug}/media/${key}`);
      const m = await media(post.slug, key, c);
      expect(m.status).toBe(200);
      expect(m.headers.get("cache-control")).toBe("private, max-age=300");
    }
    const card = await og(post.slug);
    expect(card.status).toBe(200);
    expect(card.headers.get("cache-control")).toBe("private, max-age=300");

    // Listings: only the author's own profile (with the mark and in the count); nowhere else.
    expect(await discover()).not.toContain(post.slug);
    expect(await profile(cookie["lnk-stranger"])).not.toContain(post.slug);
    expect(await profile(cookie["lnk-fan"])).not.toContain(post.slug);
    expect(await profile("")).not.toContain(post.slug);
    expect(postsCount(await profile(cookie["lnk-stranger"]))).toBe(String(Number(before) - 1));
    const own = await profile(cookie["lnk-author"]);
    expect(own).toContain(post.slug);
    expect(own).toContain("Anyone with the link</span>");
    expect(postsCount(own)).toBe(before);
    expect(await home(cookie["lnk-fan"])).not.toContain(post.slug);
    expect(await home(cookie["lnk-author"])).not.toContain(post.slug);

    // Interactions: likes, comments and bookmarks from anyone who opened it; no reposts.
    expect((await likeRoute(write(cookie["lnk-stranger"]), params({ slug: post.slug }))).status).toBe(200);
    expect((await bookmarkRoute(write(cookie["lnk-stranger"]), params({ slug: post.slug }))).status).toBe(200);
    expect(await (await bookmarksPage(req("/bookmarks", cookie["lnk-stranger"]))).text()).toContain(post.slug);
    expect((await repost(post.slug, cookie["lnk-fan"])).status).toBe(404);
    // Replies to a comment there reach its writer (they opened it).
    const first = await commentRoute(write(cookie["lnk-stranger"], { body: "Thanks for the link" }), params({ slug: post.slug }));
    expect(first.status).toBe(201);
    const parentId = ((await first.json()) as { comment: { id: string } }).comment.id;
    expect((await commentRoute(write(cookie["lnk-fan"], { body: "Me too", parentId }), params({ slug: post.slug }))).status).toBe(201);
    const notes = await listNotifications(ctx.db, "lnk-stranger", null, 20);
    expect(notes.some((n) => n.postSlug === post.slug && n.excerpt === "Me too")).toBe(true);

    // Narrower: those with the link lose it at once (lock page, no media, no card).
    await setVisibility(post.slug, "followers");
    expect((await view(post.slug)).status).toBe(403);
    expect((await media(post.slug, key, "")).status).toBe(404);
    expect((await og(post.slug)).status).toBe(404);
    expect(await (await bookmarksPage(req("/bookmarks", cookie["lnk-stranger"]))).text()).not.toContain(post.slug);
    expect((await view(post.slug, cookie["lnk-fan"])).status).toBe(200);

    // Public again: media back in the public store, Discover again.
    await setVisibility(post.slug, "link");
    await setVisibility(post.slug, "public");
    expect(inPublicStore(key)).toBe(true);
    expect(await discover()).toContain(post.slug);
    const open = await view(post.slug);
    expect(open.html).toContain('rel="canonical"');
    expect(open.html).not.toContain('content="noindex"');
  });

  it("compose: a new post can be for anyone with the link from the start; the picker offers five choices", async () => {
    const form = new FormData();
    form.set("mode", "short");
    form.set("text", "Link only from the start");
    form.set("visibility", "link");
    form.append("images", new File([new Uint8Array(await png("#117755"))], "a.png", { type: "image/png" }));
    const res = await composeRoute(new Request(`${BASE}/api/web/compose`, { method: "POST", body: form, headers: { origin: BASE, cookie: cookie["lnk-author"] } }));
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.visibility).toBe("link");
    const ids = (await ctx.db.selectFrom("revision_media").select("media_id").where("revision_id", "=", row.current_revision_id!).execute()).map((r) => r.media_id);
    for (const m of await findMediaByIds(ctx.db, ids)) {
      expect(m.public_at).toBeNull();
      for (const k of mediaKeys(m)) expect(inPublicStore(k)).toBe(false);
    }
    expect((await view(slug)).status).toBe(200);
    const box = await home(cookie["lnk-author"]);
    expect(box).toContain('<input type="radio" name="visibility" value="public" checked>');
    for (const v of ["link", "followers", "friends", "private"]) expect(box).toContain(`<input type="radio" name="visibility" value="${v}">`);
    const own = await view(slug, cookie["lnk-author"]);
    expect(own.html).toContain("Who can see: Anyone with the link");
  });

  it("media of offline posts are never served, whatever the visibility", async () => {
    const mediaId = await uploadAs(ctx, "lnk-author", await png("#334455"));
    const post = await publishAs(ctx, "lnk-author", { version: 1, blocks: [{ type: "text", text: "Soon gone" }, { type: "image", mediaId }] });
    const key = mediaKeys((await findMediaByIds(ctx.db, [mediaId]))[0])[0];
    await setVisibility(post.slug, "link");
    expect((await media(post.slug, key, "")).status).toBe(200);
    await ctx.db.updateTable("post").set({ status: "removed" }).where("id", "=", post.id).execute();
    expect((await media(post.slug, key, "")).status).toBe(404);
    expect((await media(post.slug, key, cookie["lnk-author"])).status).toBe(404);
  });
});
