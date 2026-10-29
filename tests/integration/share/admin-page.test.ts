import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as adminGet, POST as adminPost } from "@/app/admin/route";
import { GET as sectionGet } from "@/app/admin/[section]/route";
import { publishAs, shareFromNiceNote } from "../../helpers/publish";
import { NICERECORDER_APP } from "../../helpers/source-app";
import { startSession } from "@/server/auth/web/session";
import { resetConfigForTests } from "@/server/config/env";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let adminCookie: string;
let userCookie: string;
let slug: string;
let postId: string;
beforeAll(async () => {
  process.env.ADMIN_USER_IDS = "mod-1";
  ctx = await startAppContext();
  ({ slug, id: postId } = await publishAs(ctx, "admin-author", { version: 1, blocks: [{ type: "text", text: "Reported idea" }] }, "a1"));
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
const section = (cookie: string, name: string, q = "") =>
  sectionGet(new Request(`${BASE}/admin/${name}${q}`, { headers: { "accept-language": "en", cookie: `${cookie}; ni_sso=1` } }), { params: Promise.resolve({ section: name }) });
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
    const html = await (await section(adminCookie, "reports")).text();
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

  it("lists posts by status and restores one", async () => {
    const html = await (await section(adminCookie, "posts", `?s=removed&q=${slug}`)).text();
    expect(html).toContain(`/p/${slug}`);
    expect(html).toContain("Restore post");
    await act(adminCookie, { action: "restore-post", target: slug, reason: "appeal ok", back: "/admin/posts?s=removed" });
    const post = await ctx.db.selectFrom("post").select("status").where("id", "=", postId).executeTakeFirstOrThrow();
    expect(post.status).toBe("active");
  });

  it("merges reports on one comment, hides it with a ban and closes them all", async () => {
    const c = await ctx.db.insertInto("comment").values({ post_id: postId, body: "buy cheap pills", visitor_key: "vk-1", ip_hash: "ip-1", anon_name: "spammer" }).returning("id").executeTakeFirstOrThrow();
    for (const k of ["a", "b", "c"]) await ctx.db.insertInto("report").values({ post_id: postId, comment_id: c.id, reason: "spam", detail: "", reporter_key: `v:${k}`, ip_hash: k }).execute();
    const html = await (await section(adminCookie, "reports")).text();
    expect(html).toContain("buy cheap pills");
    expect(html).toMatch(/class="ad-rr-n">3</);
    expect(html).toContain("Also ban this visitor");
    const first = await ctx.db.selectFrom("report").select("id").where("comment_id", "=", c.id).orderBy("created_at").executeTakeFirstOrThrow();
    const res = await act(adminCookie, { action: "takedown", target: first.id, reason: "Spam", ban: "1", days: "7", back: "/admin/reports" });
    expect(res.headers.get("location")).toBe("/admin/reports?n=done");
    const open = await ctx.db.selectFrom("report").select("id").where("comment_id", "=", c.id).where("status", "=", "open").execute();
    expect(open).toHaveLength(0);
    const ban = await ctx.db.selectFrom("visitor_ban").selectAll().executeTakeFirstOrThrow();
    expect([ban.kind, ban.key_hash]).toEqual(["visitor", "vk-1"]);
    expect((await ctx.db.selectFrom("comment").select("status").where("id", "=", c.id).executeTakeFirstOrThrow()).status).toBe("hidden");
    expect(await (await section(adminCookie, "bans")).text()).toContain("Lift ban");
    expect(await (await section(adminCookie, "audit")).text()).toContain("Hid comment");
    expect((await act(adminCookie, { action: "unban", target: "visitor:vk-1", reason: "appeal", back: "/admin/bans" })).headers.get("location")).toBe("/admin/bans?n=done");
  });

  it("posts: source column and filter by source app / web / other apps; overview stacks posts by source app", async () => {
    const rec = await shareFromNiceNote(ctx, "admin-author", { version: 1, blocks: [{ type: "text", text: "Recorder idea" }] }, { sourceApp: NICERECORDER_APP });
    const none = await shareFromNiceNote(ctx, "admin-author", { version: 1, blocks: [{ type: "text", text: "Unnamed app idea" }] }, { sourceApp: null });
    const list = (src: string) => section(adminCookie, "posts", src ? `?src=${src}` : "").then((r) => r.text());
    const all = await list("");
    for (const label of ["All sources", "NiceNote", "NiceRecorder", "NiceList", "Other apps", "Web", "Third-party apps"]) expect(all).toContain(`>${label}<`);
    expect(all).toContain(`/p/${rec.slug}`);
    const recorder = await list("nicerecorder");
    expect(recorder).toContain(`/p/${rec.slug}`);
    expect(recorder).not.toContain(`/p/${slug}`);
    expect(recorder).toContain('href="/admin/posts?s=removed&amp;src=nicerecorder"');
    const web = await list("web");
    expect(web).toContain(`/p/${slug}`);
    expect(web).not.toContain(`/p/${rec.slug}`);
    const other = await list("other");
    expect(other).toContain(`/p/${none.slug}`);
    expect(other).not.toContain(`/p/${rec.slug}`);
    expect(await list("bogus")).toContain(`/p/${rec.slug}`);
    const zh = await (await sectionGet(new Request(`${BASE}/admin/posts?src=nicerecorder`, { headers: { "accept-language": "zh-CN", cookie: `${adminCookie}; ni_sso=1` } }), { params: Promise.resolve({ section: "posts" }) })).text();
    expect(zh).toContain("易录音");
    const overview = await (await get(adminCookie)).text();
    for (const [cls, label] of [["s1", "NiceNote"], ["s2", "NiceRecorder"], ["s5", "NiceList"], ["s6", "Other apps"], ["s3", "Web"], ["s4", "Third-party apps"]]) {
      expect(overview).toContain(`<span class="ad-li"><i class="${cls}"></i>${label}</span>`);
    }
    expect(overview).toMatch(/<rect class="s2"/);
  });

  it("renders the overview; viewers can read but not act; unknown sections 404", async () => {
    const html = await (await get(adminCookie)).text();
    expect(html).toContain("New posts");
    expect(html).toContain('class="ad-chart"');
    expect(html).toContain("ni-theme");
    await ctx.db.insertInto("admin_member").values({ user_id: "plain-user", role: "viewer", created_by: "mod-1" }).execute();
    const viewer = await (await section(userCookie, "posts")).text();
    expect(viewer).toContain("Read only");
    expect(viewer).not.toContain("ad-pop");
    expect((await act(userCookie, { action: "remove-post", target: slug, reason: "x", back: "/admin/posts" })).headers.get("location")).toBe("/admin/posts?n=failed");
    expect((await section(adminCookie, "nope")).status).toBe(404);
    await ctx.db.deleteFrom("admin_member").execute();
  });
});
