import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE as unbookmarkRoute, POST as bookmarkRoute } from "@/app/api/v1/p/[slug]/bookmark/route";
import { POST as commentRoute } from "@/app/api/v1/p/[slug]/comments/route";
import { DELETE as unlikeRoute, POST as likeRoute } from "@/app/api/v1/p/[slug]/like/route";
import { POST as commentLikeRoute } from "@/app/api/v1/comments/[id]/like/route";
import { GET as bookmarksPage } from "@/app/bookmarks/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as notificationsRoute } from "@/app/notifications/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { completeDeletion } from "@/server/accounts/account-deletion";
import { startSession } from "@/server/auth/web/session";
import { resetConfigForTests } from "@/server/config/env";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { jsonRequest, params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { publishAs } from "../../helpers/publish";

const ORIGIN = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let post: { id: string; slug: string };
let reader: string;
beforeAll(async () => {
  process.env.COMMENT_POW_BITS = "8";
  ctx = await startAppContext();
  post = await publishAs(ctx, "ai-author", { version: 1, blocks: [{ type: "text", text: "Account interactions" }] });
  await ctx.db.updateTable("profile").set({ display_name: "Reader One" }).where("user_id", "=", (await ensureProfile(ctx.db, "ai-reader")).user_id).execute();
  reader = (await startSession(ctx.db, "ai-reader")).split(";")[0];
});
afterAll(async () => {
  delete process.env.COMMENT_POW_BITS;
  resetConfigForTests();
  await ctx?.stop();
});

const slug = () => params({ slug: post.slug });
const as = (cookie: string, extra: Record<string, string> = {}) => ({ origin: ORIGIN, cookie, ...extra });
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const page = async (cookie = "", headers: Record<string, string> = {}) =>
  (await pageRoute(new Request(`${ORIGIN}/p/${post.slug}`, { headers: { cookie, "accept-language": "en", ...headers } }), slug())).text();
const postRow = () => ctx.db.selectFrom("post").selectAll().where("id", "=", post.id).executeTakeFirstOrThrow();

describe("likes belong to the signed-in account", () => {
  it("a signed-in like is the account's in every browser; an earlier guest like of this browser is not counted twice", async () => {
    const guest = await likeRoute(jsonRequest("POST", "/x", null, undefined, { origin: ORIGIN }), slug());
    const vid = guest.headers.get("set-cookie")!.split(";")[0];
    expect((await guest.json()).likeCount).toBe(1);
    // Same browser, now signed in: shows liked, a like does not add a second one.
    expect(await page(`${vid}; ${reader}`)).toMatch(/data-like="post"[^>]*aria-pressed="true"/);
    expect(await json(await likeRoute(jsonRequest("POST", "/x", null, undefined, as(`${vid}; ${reader}`)), slug()))).toEqual({ status: 200, body: { liked: true, likeCount: 1 } });
    // Unlike removes the guest like too.
    expect((await json(await unlikeRoute(jsonRequest("DELETE", "/x", null, undefined, as(`${vid}; ${reader}`)), slug()))).body).toEqual({ liked: false, likeCount: 0 });
    // A like from a fresh browser is the account's: it shows in another browser and the author is told who.
    expect((await json(await likeRoute(jsonRequest("POST", "/x", null, undefined, as(reader)), slug()))).body).toEqual({ liked: true, likeCount: 1 });
    expect(await page(reader)).toMatch(/data-like="post"[^>]*aria-pressed="true"/);
    expect(await page(vid)).toMatch(/data-like="post"[^>]*aria-pressed="false"/);
    const like = await ctx.db.selectFrom("post_like").selectAll().where("post_id", "=", post.id).executeTakeFirstOrThrow();
    expect([like.liker_key, like.user_id]).toEqual(["u:ai-reader", "ai-reader"]);
    const author = (await startSession(ctx.db, "ai-author")).split(";")[0];
    const notes = await (await notificationsRoute(new Request(`${ORIGIN}/notifications`, { headers: { cookie: author, "accept-language": "en" } }))).text();
    expect(notes).toContain("Reader One");
  });
});

describe("comments belong to the signed-in account", () => {
  it("signed in: no proof of work or nickname, shown with the account's name; guests stay anonymous", async () => {
    const html = await page(reader);
    expect(html).toContain("data-account");
    expect(html).toContain("Commenting as Reader One");
    expect(html).not.toContain('name="name"');
    const r = await json(await commentRoute(jsonRequest("POST", "/x", null, { body: "Signed comment", name: "Ignored" }, as(reader)), slug()));
    expect(r.status).toBe(201);
    expect(r.body.comment).toMatchObject({ name: "Reader One", anonymous: false });
    const row = await ctx.db.selectFrom("comment").selectAll().where("id", "=", r.body.comment.id).executeTakeFirstOrThrow();
    expect([row.author_id, row.anon_name]).toEqual(["ai-reader", null]);
    expect(row.visitor_key).toMatch(/^v:/);
    const shown = await page();
    expect(shown).toContain("Reader One");
    expect(shown).not.toContain("Ignored");
    // Guests still need the proof of work.
    expect((await commentRoute(jsonRequest("POST", "/x", null, { body: "no proof" }, { origin: ORIGIN }), slug())).status).toBe(422);
    expect(await page()).toContain('name="name"');
  });

  it("signed-in-only posts take the account's comments and refuse guests", async () => {
    await ctx.db.updateTable("post").set({ comments_mode: "signed_in" }).where("id", "=", post.id).execute();
    expect((await commentRoute(jsonRequest("POST", "/x", null, { body: "member" }, as(reader)), slug())).status).toBe(201);
    expect((await commentRoute(jsonRequest("POST", "/x", null, { body: "guest" }, { origin: ORIGIN }), slug())).status).toBe(403);
    expect(await page()).toContain("Only signed-in members can comment");
    expect(await page(reader)).toContain("data-account");
    await ctx.db.updateTable("post").set({ comments_mode: "open" }).where("id", "=", post.id).execute();
  });

  it("signed-in comments have their own rate limit", async () => {
    const spammer = (await (async () => { await ensureProfile(ctx.db, "ai-spam"); return startSession(ctx.db, "ai-spam"); })()).split(";")[0];
    for (let i = 0; i < 10; i++) expect((await commentRoute(jsonRequest("POST", "/x", null, { body: `c${i}` }, as(spammer, { "cf-connecting-ip": "10.9.9.9" })), slug())).status).toBe(201);
    expect((await commentRoute(jsonRequest("POST", "/x", null, { body: "c10" }, as(spammer, { "cf-connecting-ip": "10.9.9.9" })), slug())).status).toBe(429);
  });
});

describe("bookmarks", () => {
  it("guests get a sign-in link (count only in mainland China) and 401 from the API", async () => {
    expect(await page()).toContain(`href="/auth/sign-in?next=${encodeURIComponent(`/p/${post.slug}`)}" aria-label="Bookmark"`);
    expect(await page("", { "cf-ipcountry": "CN" })).toContain('class="ni-act ni-act-static"');
    expect((await json(await bookmarkRoute(jsonRequest("POST", "/x", null, undefined, { origin: ORIGIN }), slug()))).body.error.code).toBe("auth.required");
  });

  it("save / unsave (idempotent), public count, private list", async () => {
    expect((await json(await bookmarkRoute(jsonRequest("POST", "/x", null, undefined, as(reader)), slug()))).body).toEqual({ bookmarked: true, bookmarkCount: 1 });
    expect((await json(await bookmarkRoute(jsonRequest("POST", "/x", null, undefined, as(reader)), slug()))).body).toEqual({ bookmarked: true, bookmarkCount: 1 });
    expect((await bookmarkRoute(jsonRequest("POST", "/x", null, undefined, { cookie: reader, origin: "https://evil.example" }), slug())).status).toBe(403);
    expect(await page(reader)).toMatch(/data-bookmark="[^"]+" aria-pressed="true"/);
    // Count is public; who saved it is not.
    const anon = await page();
    expect(anon).toMatch(/aria-label="Bookmark" title="Bookmark">.*?<span>1<\/span>/);
    expect(anon).not.toContain("Reader One saved");
    const discover = await (await discoverRoute(new Request(`${ORIGIN}/discover`, { headers: { cookie: reader, "accept-language": "en" } }))).text();
    expect(discover).toMatch(/data-bookmark="[^"]+" aria-pressed="true"/);
    const list = await bookmarksPage(new Request(`${ORIGIN}/bookmarks`, { headers: { cookie: reader, "accept-language": "en" } }));
    expect(list.status).toBe(200);
    const listHtml = await list.text();
    expect(listHtml).toContain(`/p/${post.slug}`);
    expect(listHtml).toContain('<meta name="robots" content="noindex">');
    expect((await bookmarksPage(new Request(`${ORIGIN}/bookmarks`))).headers.get("location")).toBe("/auth/sign-in?next=%2Fbookmarks");
    const other = (await (async () => { await ensureProfile(ctx.db, "ai-other"); return startSession(ctx.db, "ai-other"); })()).split(";")[0];
    expect(await (await bookmarksPage(new Request(`${ORIGIN}/bookmarks`, { headers: { cookie: other, "accept-language": "en" } }))).text()).toContain("Posts you bookmark show up here");
    expect((await json(await unbookmarkRoute(jsonRequest("DELETE", "/x", null, undefined, as(reader)), slug()))).body).toEqual({ bookmarked: false, bookmarkCount: 0 });
    expect((await json(await unbookmarkRoute(jsonRequest("DELETE", "/x", null, undefined, as(reader)), slug()))).body).toEqual({ bookmarked: false, bookmarkCount: 0 });
  });

  it("the list hides posts that went private or offline (and shows them again); pages by save time", async () => {
    const posts = [];
    for (let i = 0; i < 22; i++) posts.push(await publishAs(ctx, "ai-author", { version: 1, blocks: [{ type: "text", text: `Saved ${i}` }] }));
    for (const p of posts) await bookmarkRoute(jsonRequest("POST", "/x", null, undefined, as(reader)), params({ slug: p.slug }));
    const get = async (q = "") => (await bookmarksPage(new Request(`${ORIGIN}/bookmarks${q}`, { headers: { cookie: reader, "accept-language": "en" } }))).text();
    const first = await get();
    expect(first).toContain(`/p/${posts[21].slug}`);
    expect(first).not.toContain(`/p/${posts[0].slug}"`);
    const before = first.match(/href="\/bookmarks\?before=([^"]+)"/)![1];
    const second = await get(`?before=${before}`);
    expect(second).toContain(`/p/${posts[0].slug}`);
    expect(second).toContain(`/p/${posts[1].slug}`);
    await ctx.db.updateTable("post").set({ visibility: "private" }).where("id", "=", posts[21].id).execute();
    expect(await get()).not.toContain(`/p/${posts[21].slug}"`);
    await ctx.db.updateTable("post").set({ visibility: "public" }).where("id", "=", posts[21].id).execute();
    expect(await get()).toContain(`/p/${posts[21].slug}`);
  });
});

describe("account deletion", () => {
  it("removes the account's likes, comments and bookmarks and recounts what they were part of", async () => {
    await ensureProfile(ctx.db, "ai-leaver");
    const leaver = (await startSession(ctx.db, "ai-leaver")).split(";")[0];
    const before = await postRow();
    await likeRoute(jsonRequest("POST", "/x", null, undefined, as(leaver)), slug());
    await bookmarkRoute(jsonRequest("POST", "/x", null, undefined, as(leaver)), slug());
    const { comment } = (await json(await commentRoute(jsonRequest("POST", "/x", null, { body: "bye" }, as(leaver)), slug()))).body;
    const replied = (await json(await commentRoute(jsonRequest("POST", "/x", null, { body: "reply to leaver", parentId: comment.id }, as(reader)), slug()))).body.comment;
    // The reader's earlier comment (not the reply just written; rows have no inherent order).
    const readerComment = (await ctx.db.selectFrom("comment").select("id").where("author_id", "=", "ai-reader").where("id", "<>", replied.id).orderBy("created_at", "asc").executeTakeFirstOrThrow()).id;
    await commentLikeRoute(jsonRequest("POST", "/x", null, undefined, as(leaver)), params({ id: readerComment }));
    const mid = await postRow();
    expect([mid.like_count, mid.bookmark_count, mid.comment_count]).toEqual([before.like_count + 1, before.bookmark_count + 1, before.comment_count + 2]);
    await completeDeletion({ db: ctx.db, stores: ctx.stores, cacheControl: "public, max-age=300" }, "ai-leaver");
    const after = await postRow();
    expect([after.like_count, after.bookmark_count, after.comment_count]).toEqual([before.like_count, before.bookmark_count, before.comment_count]);
    expect(await ctx.db.selectFrom("comment").select("id").where("id", "in", [comment.id, replied.id]).execute()).toEqual([]);
    const c = await ctx.db.selectFrom("comment").select("like_count").where("id", "=", readerComment).executeTakeFirstOrThrow();
    expect(c.like_count).toBe(0);
  });
});
