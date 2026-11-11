import { existsSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as bookmarkRoute } from "@/app/api/v1/p/[slug]/bookmark/route";
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
import { mediaKeys } from "@/server/media/keys";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import type { LocalStore } from "@/server/storage/local-store";
import { jsonRequest, params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif } from "../../helpers/media-fixtures";
import { publishAs, uploadAs } from "../../helpers/publish";

/** Followers-only / friends-only posts (plan docs/plan/2026-11-10-audience-visibility.md). */
const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
const cookie: Record<string, string> = {};
const handle: Record<string, string> = {};
const USERS = ["aud-author", "aud-fan", "aud-friend", "aud-stranger"] as const;

beforeAll(async () => {
  ctx = await startAppContext();
  for (const id of USERS) {
    handle[id] = (await ensureProfile(ctx.db, id)).handle;
    await ctx.db.updateTable("profile").set({ display_name: id.replace("aud-", "") }).where("user_id", "=", id).execute();
    cookie[id] = (await startSession(ctx.db, id)).split(";")[0];
  }
  // fan follows the author; friend and the author follow each other; stranger follows nobody.
  await setFollow(ctx.db, "aud-fan", "aud-author", true);
  await setFollow(ctx.db, "aud-friend", "aud-author", true);
  await setFollow(ctx.db, "aud-author", "aud-friend", true);
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
    headers: { origin: BASE, cookie: cookie["aud-author"], "content-type": "application/x-www-form-urlencoded" },
  }));
const media = (slug: string, key: string, c: string) => mediaRoute(new Request(`${BASE}/p/${slug}/media/${key}`, { headers: { cookie: c } }), { params: Promise.resolve({ slug, key: key.split("/") }) });
const write = (c: string) => jsonRequest("POST", "/x", null, undefined, { origin: BASE, cookie: c });
const home = async (c: string) => (await homeRoute(req("/", c))).text();
const profile = async (c: string) => (await profileRoute(req(`/u/${handle["aud-author"]}`, c), params({ handle: handle["aud-author"] }))).text();
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

describe("followers-only and friends-only posts", () => {
  it("followers only: followers and the author see it; others get the lock page; media and listings follow", async () => {
    const mediaId = await uploadAs(ctx, "aud-author", await jpegWithExif());
    const post = await publishAs(ctx, "aud-author", { version: 1, blocks: [{ type: "text", text: "For my followers" }, { type: "image", mediaId }] });
    const key = mediaKeys((await findMediaByIds(ctx.db, [mediaId]))[0])[0];
    expect(inPublicStore(key)).toBe(true);
    const before = postsCount(await profile(cookie["aud-stranger"]));

    expect((await setVisibility(post.slug, "followers")).headers.get("location")).toBe(`/p/${post.slug}`);
    expect(inPublicStore(key)).toBe(false);

    for (const id of ["aud-author", "aud-fan", "aud-friend"]) {
      const seen = await view(post.slug, cookie[id]);
      expect([id, seen.status]).toEqual([id, 200]);
      expect(seen.html).toContain("For my followers");
      expect(seen.html).toContain("Only the author&#39;s followers can see this post.");
      expect(seen.html).toContain('<meta name="robots" content="noindex">');
      expect(seen.html).not.toContain("data-repost-menu=");
      expect(seen.html).toContain(`/p/${post.slug}/media/${key}`);
      expect((await media(post.slug, key, cookie[id])).status).toBe(200);
    }
    const locked = await view(post.slug, cookie["aud-stranger"]);
    expect(locked.status).toBe(403);
    expect(locked.html).toContain("Only people who follow author can see this post. Follow to see it.");
    expect(locked.html).toContain('action="/follow"');
    expect(locked.html).not.toContain("For my followers");
    expect(locked.html).not.toContain('property="og:');
    const guest = await view(post.slug);
    expect(guest.status).toBe(403);
    expect(guest.html).toContain("Already following? Sign in to see it.");
    expect(guest.html).toContain(`/auth/sign-in?next=${encodeURIComponent(`/p/${post.slug}`)}`);
    expect((await media(post.slug, key, cookie["aud-stranger"])).status).toBe(404);
    expect((await media(post.slug, key, "")).status).toBe(404);
    expect((await ogRoute(req(`/p/${post.slug}/og/wide.jpg`), params({ slug: post.slug, variant: "wide.jpg" }))).status).toBe(404);

    // Listings: never on Discover; on the profile and timelines of those who may see it.
    expect(await discover()).not.toContain(post.slug);
    expect(await profile(cookie["aud-fan"])).toContain(post.slug);
    expect(await profile(cookie["aud-stranger"])).not.toContain(post.slug);
    expect(postsCount(await profile(cookie["aud-stranger"]))).toBe(String(Number(before) - 1));
    expect(postsCount(await profile(cookie["aud-fan"]))).toBe(before);
    expect(await home(cookie["aud-fan"])).toContain(post.slug);
    expect(await home(cookie["aud-author"])).toContain(post.slug);
    expect(await profile(cookie["aud-fan"])).toContain('class="ni-private"');

    // Interactions: the audience likes and saves; nobody reposts; others look at a nonexistent post.
    expect((await likeRoute(write(cookie["aud-fan"]), params({ slug: post.slug }))).status).toBe(200);
    expect((await likeRoute(write(cookie["aud-stranger"]), params({ slug: post.slug }))).status).toBe(404);
    expect((await likeRoute(write(""), params({ slug: post.slug }))).status).toBe(404);
    expect((await bookmarkRoute(write(cookie["aud-fan"]), params({ slug: post.slug }))).status).toBe(200);
    expect((await repost(post.slug, cookie["aud-fan"])).status).toBe(404);
    expect(await (await bookmarksPage(req("/bookmarks", cookie["aud-fan"]))).text()).toContain(post.slug);

    // Unfollowing ends access at once (bookmark kept, hidden).
    await setFollow(ctx.db, "aud-fan", "aud-author", false);
    expect((await view(post.slug, cookie["aud-fan"])).status).toBe(403);
    expect((await media(post.slug, key, cookie["aud-fan"])).status).toBe(404);
    expect(await home(cookie["aud-fan"])).not.toContain(post.slug);
    expect(await (await bookmarksPage(req("/bookmarks", cookie["aud-fan"]))).text()).not.toContain(post.slug);
    await setFollow(ctx.db, "aud-fan", "aud-author", true);

    // Public again: media back in the public store, Discover again.
    await setVisibility(post.slug, "public");
    expect(inPublicStore(key)).toBe(true);
    expect(await discover()).toContain(post.slug);
  });

  it("friends only: mutual follows only; a one-way follower is told to wait to be followed back", async () => {
    const post = await publishAs(ctx, "aud-author", { version: 1, blocks: [{ type: "text", text: "Between friends" }] });
    await setVisibility(post.slug, "friends");
    expect((await view(post.slug, cookie["aud-friend"])).html).toContain("Between friends");
    expect(await home(cookie["aud-friend"])).toContain(post.slug);
    const waiting = await view(post.slug, cookie["aud-fan"]);
    expect(waiting.status).toBe(403);
    expect(waiting.html).toContain("You follow author. You can see this post once they follow you back.");
    expect(waiting.html).not.toContain('action="/follow"');
    expect(await home(cookie["aud-fan"])).not.toContain(post.slug);
    const stranger = await view(post.slug, cookie["aud-stranger"]);
    expect(stranger.html).toContain("Only people who follow each other with author can see this post.");
    expect(stranger.html).toContain('action="/follow"');

    // Between non-public values nothing moves; the author's menu shows the current choice.
    expect((await setVisibility(post.slug, "followers")).status).toBe(303);
    expect((await view(post.slug, cookie["aud-fan"])).status).toBe(200);
    const own = await view(post.slug, cookie["aud-author"]);
    expect(own.html).toContain("Who can see: Followers only");
    expect(own.html).toMatch(/name="visibility" value="followers"><input type="hidden" name="back" value="[^"]+"><button type="submit" aria-current="true">/);
  });

  it("compose: a new post can be followers-only from the start (media never public)", async () => {
    const form = new FormData();
    form.set("mode", "short");
    form.set("text", "Straight to my followers");
    form.set("visibility", "followers");
    // An image of its own (the same bytes would reuse the media of the first test's public post).
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#2266cc" } }).png().toBuffer();
    form.append("images", new File([new Uint8Array(png)], "a.png", { type: "image/png" }));
    const res = await composeRoute(new Request(`${BASE}/api/web/compose`, { method: "POST", body: form, headers: { origin: BASE, cookie: cookie["aud-author"] } }));
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.visibility).toBe("followers");
    const ids = (await ctx.db.selectFrom("revision_media").select("media_id").where("revision_id", "=", row.current_revision_id!).execute()).map((r) => r.media_id);
    for (const m of await findMediaByIds(ctx.db, ids)) {
      expect(m.public_at).toBeNull();
      for (const k of mediaKeys(m)) expect(inPublicStore(k)).toBe(false);
    }
    expect((await view(slug, cookie["aud-stranger"])).status).toBe(403);
    // The picker: four choices, public checked.
    const box = await home(cookie["aud-author"]);
    expect(box).toContain('<input type="radio" name="visibility" value="public" checked>');
    for (const v of ["followers", "friends", "private"]) expect(box).toContain(`<input type="radio" name="visibility" value="${v}">`);
  });
});
