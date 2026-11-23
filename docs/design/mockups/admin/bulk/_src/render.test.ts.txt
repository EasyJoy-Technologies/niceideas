// Throwaway (git-ignored): real admin pages (posts, comments) as the base of the bulk-action mockup.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { GET as sectionGet } from "@/app/admin/[section]/route";
import { POST as adminPost } from "@/app/admin/route";
import { POST as visibilityRoute } from "@/app/api/web/posts/visibility/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../tests/helpers/app-context";
import { publishAs } from "../../tests/helpers/publish";

const OUT = "/tmp/bulk-admin-out";
const BASE = "http://127.0.0.1:8798";

it("renders pages", async () => {
  process.env.PUBLIC_BASE_URL = BASE;
  process.env.ADMIN_USER_IDS = "mod";
  const ctx = await startAppContext();
  try {
    const cookie: Record<string, string> = {};
    for (const [id, name, h] of [["au", "林小满", "linxiaoman"], ["bo", "周一鸣", "deals_bo"], ["cy", "陈雨", "chenyu"], ["mod", "管理员", "admin_k"]] as const) {
      await ensureProfile(ctx.db, id);
      await ctx.db.updateTable("profile").set({ display_name: name, handle: h }).where("user_id", "=", id).execute();
      cookie[id] = (await startSession(ctx.db, id)).split(";")[0];
    }
    const form = (c: string, url: string, f: Record<string, string>) => new Request(`${BASE}${url}`, { method: "POST", body: new URLSearchParams(f), headers: { origin: BASE, cookie: c, "content-type": "application/x-www-form-urlencoded" } });
    const texts: [string, string][] = [
      ["au", "周末的旅行照片，只发给收到链接的朋友 📷"], ["bo", "限时低价！加我微信领优惠券 ++++"], ["bo", "限时低价！点击链接立即下单"],
      ["cy", "用番茄钟写作一周后的几点体会"], ["au", "关于把笔记变成网页分享的一个小想法"], ["bo", "免费送会员，转发即可参与"],
      ["cy", "今天的晚霞特别好看"], ["au", "读书笔记：《设计中的设计》第三章"],
    ];
    const slugs: string[] = [];
    for (const [u, t] of texts) slugs.push((await publishAs(ctx, u, { version: 1, blocks: [{ type: "text", text: t }] })).slug);
    await visibilityRoute(form(cookie.au, "/api/web/posts/visibility", { slug: slugs[0], visibility: "link", back: "/" }));
    await visibilityRoute(form(cookie.cy, "/api/web/posts/visibility", { slug: slugs[6], visibility: "followers", back: "/" }));
    await adminPost(form(cookie.mod, "/admin", { action: "remove-post", target: slugs[5], reason: "垃圾广告", back: "/admin/posts" }));
    const post = await ctx.db.selectFrom("post").select("id").where("slug", "=", slugs[3]).executeTakeFirstOrThrow();
    const post2 = await ctx.db.selectFrom("post").select("id").where("slug", "=", slugs[4]).executeTakeFirstOrThrow();
    const comments: [string, string, string][] = [
      [post.id, "写得很实在，番茄钟我也在用", "小鹿"], [post.id, "加V看片 xxxx 低价出售", "aa123"], [post.id, "加V看片 xxxx 低价出售", "aa124"],
      [post2.id, "这个功能什么时候上线？期待！", "访客"], [post2.id, "点这里领取红包 → bit.ly/xxxx", "红包君"], [post2.id, "同意，分享链接很方便", "阿木"],
    ];
    for (const [pid, body, name] of comments) await ctx.db.insertInto("comment").values({ post_id: pid, body, visitor_key: `vk-${name}`, ip_hash: "h", anon_name: name }).execute();
    const hid = await ctx.db.selectFrom("comment").select("id").where("anon_name", "=", "aa123").executeTakeFirstOrThrow();
    await adminPost(form(cookie.mod, "/admin", { action: "hide-comment", target: hid.id, reason: "垃圾广告", back: "/admin/comments" }));
    mkdirSync(OUT, { recursive: true });
    for (const [lang, al] of [["zh", "zh-CN"], ["en", "en"]] as const) {
      const get = (url: string) => new Request(`${BASE}${url}`, { headers: { "accept-language": al, cookie: `ni_sso=1; ${cookie.mod}` } });
      for (const s of ["posts", "comments"]) writeFileSync(`${OUT}/${s}-${lang}.html`, await (await sectionGet(get(`/admin/${s}`), { params: Promise.resolve({ section: s }) })).text());
    }
    expect(1).toBe(1);
  } finally {
    await ctx.stop();
  }
});
