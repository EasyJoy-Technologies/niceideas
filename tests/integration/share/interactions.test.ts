import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { PATCH as settingsRoute } from "@/app/api/v1/posts/[id]/route";
import { GET as authorListRoute } from "@/app/api/v1/posts/[id]/comments/route";
import { DELETE as authorDeleteRoute } from "@/app/api/v1/posts/[id]/comments/[commentId]/route";
import { DELETE as unlikeRoute, POST as likeRoute } from "@/app/api/v1/p/[slug]/like/route";
import { POST as commentRoute } from "@/app/api/v1/p/[slug]/comments/route";
import { GET as challengeRoute } from "@/app/api/v1/p/[slug]/comments/challenge/route";
import { POST as commentLikeRoute } from "@/app/api/v1/comments/[id]/like/route";
import { POST as reportRoute } from "@/app/api/v1/reports/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { resetConfigForTests } from "@/server/config/env";
import { upsertBan } from "@/server/db/repos/moderation";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
let token: string;
let post: { id: string; slug: string };
beforeAll(async () => {
  process.env.COMMENT_POW_BITS = "8";
  ctx = await startAppContext();
  // Published by an third-party app, so the author can also manage comments through the API.
  token = await ctx.apiToken("author-x");
  const res = await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document: { version: 1, blocks: [{ type: "text", text: "Talk to me" }] }, sourceRef: "ix", sourceUpdatedAt: "2026-10-20T00:00:00Z" }, { "idempotency-key": "ix" }), {});
  post = (await res.json()).post;
});
afterAll(async () => {
  delete process.env.COMMENT_POW_BITS;
  resetConfigForTests();
  await ctx?.stop();
});

const ORIGIN = "http://localhost:3000";
const visitor = (cookie?: string, extra: Record<string, string> = {}) => ({ origin: ORIGIN, ...(cookie ? { cookie } : {}), ...extra });
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";
const slug = () => params({ slug: post.slug });

async function solved(headers: Record<string, string>) {
  const { challenge, bits } = await (await challengeRoute(jsonRequest("GET", "/x", null, undefined, headers), slug())).json();
  for (let n = 0; ; n++) {
    const h = createHash("sha256").update(`${challenge}:${n.toString(36)}`).digest();
    if (h.readUInt32BE(0) >>> (32 - bits) === 0) return { challenge, nonce: n.toString(36) };
  }
}
const comment = async (headers: Record<string, string>, body: Record<string, unknown>) =>
  commentRoute(jsonRequest("POST", "/x", null, { ...(await solved(headers)), ...body }, headers), slug());
const page = async (cookie = "") => (await pageRoute(new Request(`${ORIGIN}/p/${post.slug}`, { headers: { cookie, "accept-language": "en" } }), slug())).text();

describe("likes", () => {
  it("guest like is idempotent per browser, can be undone, and needs our origin", async () => {
    const first = await likeRoute(jsonRequest("POST", "/x", null, undefined, visitor()), slug());
    expect(await first.json()).toEqual({ liked: true, likeCount: 1 });
    const cookie = cookieOf(first);
    expect(cookie).toMatch(/^ni_vid=[A-Za-z0-9_-]{22}$/);
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await (await likeRoute(jsonRequest("POST", "/x", null, undefined, visitor(cookie)), slug())).json()).toEqual({ liked: true, likeCount: 1 });
    expect(await page(cookie)).toMatch(/data-like="post"[^>]*aria-pressed="true"/);
    expect(await (await unlikeRoute(jsonRequest("DELETE", "/x", null, undefined, visitor(cookie)), slug())).json()).toEqual({ liked: false, likeCount: 0 });
    const cross = await likeRoute(jsonRequest("POST", "/x", null, undefined, { origin: "https://evil.example" }), slug());
    expect(cross.status).toBe(403);
    expect((await likeRoute(jsonRequest("POST", "/x", null, undefined, visitor(undefined, { "cf-ipcountry": "CN" })), slug())).status).toBe(200);
  });
});

describe("anonymous comments", () => {
  let cookie: string;
  let top: string;

  it("posts with a valid proof, shows on the page as anonymous, counts on the post", async () => {
    const res = await comment(visitor(), { body: "  Lovely <b>idea</b>\nline two ", name: "Cat" });
    expect(res.status).toBe(201);
    cookie = cookieOf(res);
    const { comment: c, page: p } = await res.json();
    expect(c).toMatchObject({ body: "Lovely <b>idea</b>\nline two", name: "Cat", anonymous: true, parentId: null });
    expect(p).toBe(1);
    top = c.id;
    const html = await page(cookie);
    expect(html).toContain("Lovely &lt;b&gt;idea&lt;/b&gt;<br>line two");
    expect(html).toContain('<span class="ni-tag">Anonymous</span>');
    expect(html).toContain('<h2>Comments <span>1</span></h2>');
  });

  it("replies stay one level deep; proofs are single-use; limits and modes apply", async () => {
    const reply = await (await comment(visitor(cookie), { body: "reply", parentId: top })).json();
    const nested = await (await comment(visitor(cookie), { body: "reply to reply", parentId: reply.comment.id })).json();
    expect(nested.comment.parentId).toBe(top);

    const proof = await solved(visitor(cookie));
    expect((await commentRoute(jsonRequest("POST", "/x", null, { ...proof, body: "a" }, visitor(cookie)), slug())).status).toBe(201);
    expect((await commentRoute(jsonRequest("POST", "/x", null, { ...proof, body: "b" }, visitor(cookie)), slug())).status).toBe(422);
    expect((await comment(visitor(cookie), { body: "x".repeat(2001) })).status).toBe(400);
    // 4 comments so far from this browser; the 10-minute budget is 5.
    expect((await comment(visitor(cookie), { body: "fifth" })).status).toBe(201);
    expect((await comment(visitor(cookie), { body: "sixth" })).status).toBe(429);

    await settingsRoute(jsonRequest("PATCH", `/api/v1/posts/${post.id}`, token, { commentsMode: "closed" }), params({ id: post.id }));
    expect((await comment(visitor(), { body: "closed?" })).status).toBe(403);
    expect(await page()).toContain("Comments are closed.");
    await settingsRoute(jsonRequest("PATCH", `/api/v1/posts/${post.id}`, token, { commentsMode: "open" }), params({ id: post.id }));
  });

  it("comment likes, reports and bans", async () => {
    const liked = await commentLikeRoute(jsonRequest("POST", "/x", null, undefined, visitor(cookie)), params({ id: top }));
    expect(await liked.json()).toEqual({ liked: true, likeCount: 1 });
    const report = { slug: post.slug, commentId: top, reason: "spam" };
    expect((await reportRoute(jsonRequest("POST", "/x", null, report, visitor(cookie)), {})).status).toBe(202);
    expect((await reportRoute(jsonRequest("POST", "/x", null, report, visitor(cookie)), {})).status).toBe(202);
    const open = await ctx.db.selectFrom("report").selectAll().where("comment_id", "=", top).execute();
    expect(open).toHaveLength(1);

    const row = await ctx.db.selectFrom("comment").select("visitor_key").where("id", "=", top).executeTakeFirstOrThrow();
    await upsertBan(ctx.db, { kind: "visitor", keyHash: row.visitor_key!, reason: "test", createdBy: "admin", expiresAt: null });
    const banned = await comment(visitor(cookie), { body: "still here?" });
    expect(await banned.json()).toMatchObject({ error: { code: "visitor.banned" } });
  });

  it("the author lists and deletes comments under their post", async () => {
    const list = await (await authorListRoute(jsonRequest("GET", "/x", token), params({ id: post.id }))).json();
    expect(list.comments.length).toBeGreaterThanOrEqual(5);
    const del = await authorDeleteRoute(jsonRequest("DELETE", "/x", token), params({ id: post.id, commentId: top }));
    expect(del.status).toBe(200);
    const html = await page();
    expect(html).not.toContain("Lovely &lt;b&gt;idea");
    const other = await ctx.apiToken("someone-else");
    expect((await authorDeleteRoute(jsonRequest("DELETE", "/x", other), params({ id: post.id, commentId: top }))).status).toBe(404);
    const audit = await ctx.db.selectFrom("moderation_action").selectAll().where("comment_id", "=", top).execute();
    expect(audit).toMatchObject([{ action: "delete_comment", actor_id: "author-x", reason: "author" }]);
  });
});
