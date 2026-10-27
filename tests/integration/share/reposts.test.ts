import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as composeRoute } from "@/app/api/web/compose/route";
import { POST as repostRoute } from "@/app/api/web/posts/repost/route";
import { POST as commentRoute } from "@/app/api/v1/p/[slug]/comments/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as notificationsRoute } from "@/app/notifications/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { GET as homeRoute } from "@/app/route";
import { GET as settingsRoute } from "@/app/settings/route";
import { GET as profileRoute } from "@/app/u/[handle]/route";
import { startSession } from "@/server/auth/web/session";
import { setFollow } from "@/server/db/repos/follows";
import { countersTouchedBy, recountCounters } from "@/server/db/repos/interaction-counts";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { jsonRequest, params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { deleteAs, publishAs, type Published } from "../../helpers/publish";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let short: Published;
let article: Published;
const cookies: Record<string, string> = {};
const handles: Record<string, string> = {};

beforeAll(async () => {
  ctx = await startAppContext();
  for (const [id, name] of [["rp-author", "Author Ann"], ["rp-reposter", "Reposter Rex"], ["rp-fan", "Fan Fay"]] as const) {
    const p = await ensureProfile(ctx.db, id);
    await ctx.db.updateTable("profile").set({ display_name: name }).where("user_id", "=", id).execute();
    handles[id] = p.handle;
    cookies[id] = (await startSession(ctx.db, id)).split(";")[0];
  }
  short = await publishAs(ctx, "rp-author", { version: 1, blocks: [{ type: "text", text: "Walking idea" }] });
  article = await publishAs(ctx, "rp-author", { version: 1, title: "Lake list", blocks: [{ type: "text", text: "word ".repeat(600) }] });
  await setFollow(ctx.db, "rp-fan", "rp-reposter", true);
});
afterAll(async () => ctx?.stop());

const html = async (res: Response | Promise<Response>) => (await res).text();
const get = (url: string, cookie = "", headers: Record<string, string> = {}) =>
  new Request(`${BASE}${url}`, { headers: { "accept-language": "en", cookie: `ni_sso=1${cookie ? `; ${cookie}` : ""}`, ...headers } });
function repost(slug: string, on: boolean, cookie: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("slug", slug);
  form.set("on", on ? "1" : "0");
  form.set("back", "/discover");
  return repostRoute(new Request(`${BASE}/api/web/posts/repost`, { method: "POST", body: form, headers: { origin: BASE, cookie, accept: "application/json", ...headers } }));
}
function compose(fields: Record<string, string>, cookie: string) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return composeRoute(new Request(`${BASE}/api/web/compose`, { method: "POST", body: form, headers: { origin: BASE, cookie } }));
}
const page = (slug: string, cookie = "") => html(pageRoute(get(`/p/${slug}`, cookie), params({ slug })));
const profile = (id: string, query = "", cookie = "") => html(profileRoute(get(`/u/${handles[id]}${query}`, cookie), params({ handle: handles[id] })));
const occurrences = (text: string, part: string) => text.split(part).length - 1;

describe("reposts", () => {
  it("signed in only, idempotent, counted; not in mainland China; private posts look nonexistent", async () => {
    expect((await repost(short.slug, true, "")).status).toBe(401);
    const noJs = await repostRoute(new Request(`${BASE}/api/web/posts/repost`, { method: "POST", body: new FormData(), headers: { origin: BASE } }));
    expect([noJs.status, noJs.headers.get("location")]).toEqual([303, "/auth/sign-in?next=%2F"]);
    expect((await repost(short.slug, true, cookies["rp-reposter"], { "cf-ipcountry": "CN" })).status).toBe(451);
    expect(await (await repost(short.slug, true, cookies["rp-reposter"])).json()).toEqual({ reposted: true, repostCount: 1 });
    expect(await (await repost(short.slug, true, cookies["rp-reposter"])).json()).toEqual({ reposted: true, repostCount: 1 });
    const row = await ctx.db.selectFrom("post").select("repost_count").where("id", "=", short.id).executeTakeFirstOrThrow();
    expect(row.repost_count).toBe(1);
    const priv = await publishAs(ctx, "rp-author", { version: 1, blocks: [{ type: "text", text: "Only me" }] });
    await ctx.db.updateTable("post").set({ visibility: "private" }).where("id", "=", priv.id).execute();
    expect((await repost(priv.slug, true, cookies["rp-reposter"])).status).toBe(404);
    // Cross-site forms are refused.
    expect((await repost(short.slug, true, cookies["rp-reposter"], { origin: "https://evil.example" })).status).toBe(403);
  });

  it("shows the repost menu and state on cards and the post page; hidden in mainland China and for private posts", async () => {
    const own = await page(short.slug, cookies["rp-reposter"]);
    expect(own).toMatch(new RegExp(`<details class="ni-menu ni-rp" data-repost-menu="${short.slug}" data-reposted>`));
    expect(own).toContain("Undo repost");
    expect(own).toContain(`href="/?quote=${short.slug}#compose"`);
    expect(await page(short.slug)).toMatch(/<a class="ni-act" href="\/auth\/sign-in\?next=[^"]+" aria-label="Repost"/);
    expect(await html(pageRoute(get(`/p/${short.slug}`, "", { "cf-ipcountry": "CN" }), params({ slug: short.slug })))).not.toContain("ni-rp");
  });

  it("home timeline: followed accounts' reposts with \"X reposted\", each post once; Discover shows no reposts", async () => {
    const home = await html(homeRoute(get("/", cookies["rp-fan"])));
    expect(home).toContain("Reposter Rex</a> reposted");
    expect(home).toContain(`data-href="/p/${short.slug}"`);
    const articleCard = `<a class="ni-fc-article ni-fc-plain" href="/p/${article.slug}">`;
    expect(home.includes(articleCard)).toBe(false);
    // Following the author too: the post still shows once, at the newer repost.
    await setFollow(ctx.db, "rp-fan", "rp-author", true);
    const both = await html(homeRoute(get("/", cookies["rp-fan"])));
    expect(occurrences(both, `data-href="/p/${short.slug}"`)).toBe(1);
    expect(both).toContain("Reposter Rex</a> reposted");
    expect(both.includes(articleCard)).toBe(true);
    expect(both.indexOf(`data-href="/p/${short.slug}"`)).toBeLessThan(both.indexOf(articleCard));
    await setFollow(ctx.db, "rp-fan", "rp-author", false);
    const discover = await html(discoverRoute(get("/discover", cookies["rp-fan"])));
    expect(discover.includes("reposted</span>")).toBe(false);
  });
});

describe("quotes", () => {
  let quote: string;

  it("home ?quote= opens the compose box with the quoted post; an unavailable one says so", async () => {
    const home = await html(homeRoute(get(`/?quote=${article.slug}`, cookies["rp-reposter"])));
    expect(home).toContain(`<input type="hidden" name="quote" value="${article.slug}" data-send>`);
    expect(home).toContain('<div class="ni-compose-quoted"><div class="ni-qe">');
    expect(home).toContain("Add your comment…");
    expect(home).not.toContain('class="ni-compose-seg"');
    const gone = await html(homeRoute(get("/?quote=zzzzzzzzzzzzzz", cookies["rp-reposter"])));
    expect(gone).toContain("The post you are quoting is no longer available.");
    expect(gone).not.toContain('name="quote"');
  });

  it("publishes a short quote pointing at the post; the quote shows it, its count includes quotes", async () => {
    const res = await compose({ mode: "long", title: "ignored", text: "Worth reading", quote: article.slug }, cookies["rp-reposter"]);
    expect(res.status).toBe(303);
    quote = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", quote).executeTakeFirstOrThrow();
    expect([row.kind, row.title, row.quote_of]).toEqual(["short", "", article.id]);
    const shown = await page(quote);
    expect(shown).toContain(`<a class="ni-qe" href="/p/${article.slug}">`);
    expect(shown).toContain("Lake list");
    expect(await page(article.slug, cookies["rp-fan"])).toMatch(/aria-label="Repost" title="Repost"><svg[^>]*>.*?<\/svg><span data-repost-count>1<\/span>/);
    const bad = await compose({ text: "x", quote: "zzzzzzzzzzzzzz" }, cookies["rp-reposter"]);
    expect(bad.headers.get("location")).toBe("/?compose=quote_gone#compose");
    const tooLong = await compose({ text: "y".repeat(600), quote: article.slug }, cookies["rp-reposter"]);
    expect(tooLong.headers.get("location")).toBe(`/?compose=short_too_long&quote=${article.slug}#compose`);
  });

  it("notifies the author of reposts and quotes", async () => {
    const notes = await html(notificationsRoute(get("/notifications", cookies["rp-author"])));
    expect(notes).toContain("Reposter Rex</a> reposted your post");
    expect(notes).toContain("Reposter Rex</a> quoted your post");
    expect(notes).toContain(`href="/p/${quote}"`);
  });

  it("a quote whose post went offline says it is no longer available", async () => {
    const gone = await publishAs(ctx, "rp-author", { version: 1, blocks: [{ type: "text", text: "Soon gone" }] });
    const res = await compose({ text: "Quoting", quote: gone.slug }, cookies["rp-reposter"]);
    const slug = res.headers.get("location")!.replace("/p/", "");
    await deleteAs(ctx, gone.id);
    const shown = await page(slug);
    expect(shown).toContain('<div class="ni-qe ni-qe-gone">');
    expect(shown).toContain("This post is no longer available");
  });
});

describe("profile tabs", () => {
  it("someone else's profile: All, Articles, Replies, Reposts (no Bookmarks); ?tab=bookmarks falls back to All", async () => {
    const other = await profile("rp-reposter", "", cookies["rp-fan"]);
    expect(other).toContain('<nav class="ni-tabs ni-tabs-even">');
    expect(other).toContain("?tab=reposts");
    expect(other).not.toContain("?tab=bookmarks");
    expect(other).not.toContain('class="ni-btn ni-btn-ghost ni-prof-set"');
    expect(await profile("rp-reposter", "?tab=bookmarks", cookies["rp-fan"])).toMatch(/<a href="\/@[^"?]+" aria-current="page">All<\/a>/);
  });

  it("Reposts: plain reposts (with the reposted line) and quotes, newest first", async () => {
    const tab = await profile("rp-reposter", "?tab=reposts", cookies["rp-fan"]);
    expect(tab).toContain("Reposter Rex</a> reposted");
    expect(tab).toContain("Worth reading");
    expect(tab.indexOf("Worth reading")).toBeLessThan(tab.indexOf("Walking idea"));
    expect(await profile("rp-reposter", "?tab=reposts", cookies["rp-reposter"])).toContain("You reposted");
  });

  it("Replies: the account's comments with whom they answer and the post", async () => {
    const r = await commentRoute(jsonRequest("POST", "/x", null, { body: "Love this walk" }, { origin: BASE, cookie: cookies["rp-reposter"] }), params({ slug: short.slug }));
    expect(r.status).toBe(201);
    const tab = await profile("rp-reposter", "?tab=replies");
    expect(tab).toContain("Love this walk");
    expect(tab).toContain(`Replying to <a href="/@${handles["rp-author"]}">@${handles["rp-author"]}</a>`);
    expect(tab).toMatch(new RegExp(`<article class="ni-card ni-fc ni-reply" data-href="/p/${short.slug}#c-[0-9a-f-]+">`));
    expect(tab).toContain(`<a class="ni-qe" href="/p/${short.slug}">`);
  });

  it("own profile: Bookmarks tab and Settings; Settings has Sign out", async () => {
    const own = await profile("rp-reposter", "?tab=bookmarks", cookies["rp-reposter"]);
    expect(own).toMatch(/\?tab=bookmarks" aria-current="page">Bookmarks<\/a>/);
    expect(own).toContain('<a class="ni-btn ni-btn-ghost ni-prof-set" href="/settings">');
    const settings = await html(settingsRoute(get("/settings", cookies["rp-reposter"])));
    expect(settings).toContain('<form class="ni-card ni-settings ni-signout" method="post" action="/auth/sign-out">');
  });
});

describe("counters", () => {
  it("an account's reposts are recounted when its rows go away", async () => {
    const touched = await countersTouchedBy(ctx.db, "rp-reposter");
    expect(touched.postIds).toContain(short.id);
    await ctx.db.deleteFrom("post_repost").where("user_id", "=", "rp-reposter").execute();
    await recountCounters(ctx.db, touched);
    const row = await ctx.db.selectFrom("post").select("repost_count").where("id", "=", short.id).executeTakeFirstOrThrow();
    expect(row.repost_count).toBe(0);
  });
});
