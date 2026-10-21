import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as adminGet, POST as adminPost } from "@/app/admin/route";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { startSession } from "@/server/auth/web/session";
import { resetConfigForTests } from "@/server/config/env";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest } from "../../helpers/api";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let adminCookie: string;
let userCookie: string;
let slug: string;
let postId: string;
beforeAll(async () => {
  process.env.ADMIN_USER_IDS = "mod-1";
  ctx = await startAppContext();
  const token = await ctx.tokenFor("admin-author");
  const res = await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document: { version: 1, blocks: [{ type: "text", text: "Reported idea" }] }, sourceRef: "a1", sourceUpdatedAt: "2026-10-21T00:00:00Z" }), {});
  ({ slug, id: postId } = (await res.json()).post);
  await ensureProfile(ctx.db, "mod-1");
  await ensureProfile(ctx.db, "plain-user");
  adminCookie = (await startSession(ctx.db, "mod-1")).split(";")[0];
  userCookie = (await startSession(ctx.db, "plain-user")).split(";")[0];
});
afterAll(async () => {
  delete process.env.ADMIN_USER_IDS;
  resetConfigForTests();
  await ctx?.stop();
});

const get = (cookie: string, q = "") => adminGet(new Request(`${BASE}/admin${q}`, { headers: { "accept-language": "en", cookie: `${cookie}; ni_sso=1` } }));
const act = (cookie: string, fields: Record<string, string>) =>
  adminPost(new Request(`${BASE}/admin`, { method: "POST", body: new URLSearchParams(fields), headers: { origin: BASE, cookie, "content-type": "application/x-www-form-urlencoded" } }));

describe("admin console", () => {
  it("is hidden from non-admins", async () => {
    expect((await get(userCookie)).status).toBe(404);
    expect((await act(userCookie, { action: "remove-post", target: slug, reason: "x" })).status).toBe(404);
    expect((await adminGet(new Request(`${BASE}/admin`))).headers.get("location")).toBe("/auth/sign-in?next=%2Fadmin");
  });

  it("lists open reports and takes a reported post down with an audited reason", async () => {
    await ctx.db.insertInto("report").values({ post_id: postId, reason: "spam", detail: "buy now", reporter_key: "v:x", ip_hash: "h" }).execute();
    const html = await (await get(adminCookie)).text();
    expect(html).toContain("Spam or scam");
    expect(html).toContain("buy now");
    const report = await ctx.db.selectFrom("report").select("id").executeTakeFirstOrThrow();
    expect((await act(adminCookie, { action: "takedown", target: report.id, reason: "" })).headers.get("location")).toBe("/admin?n=failed");
    expect((await act(adminCookie, { action: "takedown", target: report.id, reason: "spam" })).headers.get("location")).toBe("/admin?n=done");
    const post = await ctx.db.selectFrom("post").select("status").where("id", "=", postId).executeTakeFirstOrThrow();
    expect(post.status).toBe("removed");
    const audit = await ctx.db.selectFrom("moderation_action").select(["action", "actor_id"]).orderBy("created_at").execute();
    expect(audit.map((a) => a.action)).toEqual(["remove", "resolve_report"]);
    expect(audit.every((a) => a.actor_id === "mod-1")).toBe(true);
  });

  it("finds a post by link and restores it", async () => {
    const html = await (await get(adminCookie, `?post=${encodeURIComponent(`https://t.niceideas.app/p/${slug}`)}`)).text();
    expect(html).toContain("Restore post");
    await act(adminCookie, { action: "restore-post", target: slug, reason: "appeal ok" });
    const post = await ctx.db.selectFrom("post").select("status").where("id", "=", postId).executeTakeFirstOrThrow();
    expect(post.status).toBe("active");
  });
});
