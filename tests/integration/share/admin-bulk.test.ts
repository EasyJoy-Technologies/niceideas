import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as adminPost } from "@/app/admin/route";
import { GET as sectionGet } from "@/app/admin/[section]/route";
import { BULK_MAX } from "@/server/admin/bulk-actions";
import { startSession } from "@/server/auth/web/session";
import { resetConfigForTests } from "@/server/config/env";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";
import { publishAs } from "../../helpers/publish";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let adminCookie: string;
let viewerCookie: string;
const slugs: string[] = [];
let postId: string;

beforeAll(async () => {
  process.env.ADMIN_USER_IDS = "bulk-mod";
  ctx = await startAppContext();
  for (const text of ["One", "Two", "Three", "Four"]) {
    const p = await publishAs(ctx, "bulk-author", { version: 1, blocks: [{ type: "text", text: `Bulk idea ${text}` }] });
    slugs.push(p.slug);
    postId = p.id;
  }
  await ensureProfile(ctx.db, "bulk-mod");
  await ensureProfile(ctx.db, "bulk-viewer");
  await ctx.db.insertInto("admin_member").values({ user_id: "bulk-viewer", role: "viewer", created_by: "bulk-mod" }).execute();
  adminCookie = (await startSession(ctx.db, "bulk-mod")).split(";")[0];
  viewerCookie = (await startSession(ctx.db, "bulk-viewer")).split(";")[0];
});
afterAll(async () => {
  delete process.env.ADMIN_USER_IDS;
  resetConfigForTests();
  await ctx?.stop();
});

const page = (cookie: string, name: string, q = "") =>
  sectionGet(new Request(`${BASE}/admin/${name}${q}`, { headers: { "accept-language": "en", cookie: `${cookie}; ni_sso=1` } }), { params: Promise.resolve({ section: name }) }).then((r) => r.text());
/** Bulk form post; `targets` repeat like the checked boxes. */
const bulk = (cookie: string, op: string, targets: string[], fields: Record<string, string> = {}) => {
  const body = new URLSearchParams({ action: "bulk", op, reason: "Spam wave", back: "/admin/posts", ...fields });
  for (const t of targets) body.append("targets", t);
  return adminPost(new Request(`${BASE}/admin`, { method: "POST", body, headers: { origin: BASE, cookie, "content-type": "application/x-www-form-urlencoded" } })).then((r) => r.headers.get("location"));
};
const statusOf = async (slug: string) => (await ctx.db.selectFrom("post").select(["status", "visibility"]).where("slug", "=", slug).executeTakeFirstOrThrow());
const audits = (action: "remove" | "restore" | "visibility" | "hide_comment" | "restore_comment") =>
  ctx.db.selectFrom("moderation_action").select(["reason", "actor_id"]).where("action", "=", action).execute();

describe("admin bulk actions", () => {
  it("lists show the checkbox column and the bulk bar to moderators only", async () => {
    const html = await page(adminCookie, "posts");
    expect(html).toContain('<form id="ad-bulk" class="ad-bulk" method="post" action="/admin"');
    expect(html).toContain(`<input type="checkbox" form="ad-bulk" name="targets" value="${slugs[0]}"`);
    expect(html).toContain('data-selected="{count} of 4 selected"');
    expect(html).toContain('<option value="set-visibility">Narrow visibility</option>');
    expect(html).not.toContain('<option value="public">');
    expect(html).toContain("/scripts/admin.js");
    const ro = await page(viewerCookie, "posts");
    expect(ro).toContain(`/p/${slugs[0]}`);
    expect(ro).not.toContain("ad-bulk");
    expect(ro).not.toContain('name="targets"');
  });

  it("removes several posts with one reason, one audit row each; posts it does not apply to are skipped", async () => {
    expect(await bulk(adminCookie, "remove-post", [slugs[0]])).toBe("/admin/posts?n=bulk&op=remove-post&ok=1&skip=0&fail=0");
    const loc = await bulk(adminCookie, "remove-post", [slugs[0], slugs[1], slugs[2], slugs[1], "no-such-post"], { back: "/admin/posts?o=30" });
    expect(loc).toBe("/admin/posts?o=30&n=bulk&op=remove-post&ok=2&skip=2&fail=0");
    for (const s of slugs.slice(0, 3)) expect((await statusOf(s)).status).toBe("removed");
    expect((await statusOf(slugs[3])).status).toBe("active");
    const rows = await audits("remove");
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.reason === "Spam wave" && r.actor_id === "bulk-mod")).toBe(true);
    const html = await page(adminCookie, "posts", "?n=bulk&op=remove-post&ok=2&skip=2&fail=0");
    expect(html).toContain('<p class="ad-note ok" role="status">Remove post: 2 done · 2 skipped</p>');
  });

  it("restores removed posts and skips live ones", async () => {
    expect(await bulk(adminCookie, "restore-post", [slugs[0], slugs[1], slugs[3]])).toBe("/admin/posts?n=bulk&op=restore-post&ok=2&skip=1&fail=0");
    expect((await statusOf(slugs[0])).status).toBe("active");
    expect((await statusOf(slugs[2])).status).toBe("removed");
    expect(await audits("restore")).toHaveLength(2);
  });

  it("only narrows visibility: wider or equal targets and removed posts are skipped", async () => {
    expect(await bulk(adminCookie, "set-visibility", [slugs[0], slugs[1], slugs[2]], { visibility: "followers" })).toBe("/admin/posts?n=bulk&op=set-visibility&ok=2&skip=1&fail=0");
    expect((await statusOf(slugs[0])).visibility).toBe("followers");
    expect((await statusOf(slugs[2])).visibility).toBe("public");
    expect(await bulk(adminCookie, "set-visibility", [slugs[0], slugs[3]], { visibility: "public" })).toBe("/admin/posts?n=bulk&op=set-visibility&ok=0&skip=2&fail=0");
    expect(await bulk(adminCookie, "set-visibility", [slugs[0], slugs[3]], { visibility: "private" })).toBe("/admin/posts?n=bulk&op=set-visibility&ok=2&skip=0&fail=0");
    expect((await statusOf(slugs[0])).visibility).toBe("private");
    expect(await audits("visibility")).toHaveLength(4);
    const html = await page(adminCookie, "posts", "?n=bulk&op=set-visibility&ok=0&skip=2&fail=0");
    expect(html).toContain('<p class="ad-note bad" role="status">Narrow visibility: 0 done · 2 skipped</p>');
  });

  it("hides visible comments and restores hidden ones", async () => {
    const ids: string[] = [];
    for (const body of ["spam a", "spam b", "fine c"]) {
      const c = await ctx.db.insertInto("comment").values({ post_id: postId, body, visitor_key: `vk-${body}`, ip_hash: "h", anon_name: "x" }).returning("id").executeTakeFirstOrThrow();
      ids.push(c.id);
    }
    const html = await page(adminCookie, "comments");
    expect(html).toContain(`<input type="checkbox" form="ad-bulk" name="targets" value="${ids[0]}"`);
    expect(html).toContain('<option value="hide-comment">Hide comment</option>');
    expect(html).not.toContain('name="visibility"><option value="link"');
    expect(await bulk(adminCookie, "hide-comment", [ids[0], ids[1]], { back: "/admin/comments" })).toBe("/admin/comments?n=bulk&op=hide-comment&ok=2&skip=0&fail=0");
    expect(await bulk(adminCookie, "hide-comment", [ids[0], ids[2], "not-a-uuid"], { back: "/admin/comments" })).toBe("/admin/comments?n=bulk&op=hide-comment&ok=1&skip=2&fail=0");
    expect(await bulk(adminCookie, "restore-comment", ids, { back: "/admin/comments" })).toBe("/admin/comments?n=bulk&op=restore-comment&ok=3&skip=0&fail=0");
    expect(await audits("hide_comment")).toHaveLength(3);
    expect(await audits("restore_comment")).toHaveLength(3);
    // Bulk hide never bans.
    expect(await ctx.db.selectFrom("visitor_ban").selectAll().execute()).toHaveLength(0);
  });

  it("refuses invalid requests and read-only members", async () => {
    const before = (await ctx.db.selectFrom("moderation_action").select("id").execute()).length;
    expect(await bulk(adminCookie, "remove-post", [slugs[3]], { reason: " " })).toBe("/admin/posts?n=failed");
    expect(await bulk(adminCookie, "remove-post", [])).toBe("/admin/posts?n=failed");
    expect(await bulk(adminCookie, "unban", [slugs[3]])).toBe("/admin/posts?n=failed");
    expect(await bulk(adminCookie, "set-visibility", [slugs[3]], { visibility: "everyone" })).toBe("/admin/posts?n=failed");
    expect(await bulk(adminCookie, "remove-post", Array.from({ length: BULK_MAX + 1 }, (_, i) => `slug${i}`))).toBe("/admin/posts?n=failed");
    expect(await bulk(viewerCookie, "remove-post", [slugs[3]])).toBe("/admin/posts?n=failed");
    expect((await statusOf(slugs[3])).status).toBe("active");
    expect((await ctx.db.selectFrom("moderation_action").select("id").execute()).length).toBe(before);
    // A forged notice is clamped and ignored for unknown actions.
    expect(await page(adminCookie, "posts", "?n=bulk&op=remove-post&ok=99999&skip=-3&fail=x")).toContain(`Remove post: ${BULK_MAX} done · 0 skipped`);
    expect(await page(adminCookie, "posts", "?n=bulk&op=unban&ok=1")).not.toContain("ad-note");
  });
});
