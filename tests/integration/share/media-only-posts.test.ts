import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as composeRoute } from "@/app/api/web/compose/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as notificationsRoute } from "@/app/notifications/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { clearAsideCacheForTests } from "@/server/share/discover-aside";
import { params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { mp3Tone, smallPngWithAlpha } from "../../helpers/media-fixtures";
import { publishAs, uploadAs, type Published } from "../../helpers/publish";

// Posts with images or audio only (no title, no text): plan 2026-11-23, public side of the v1.0.98 admin placeholder.
const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let pic: Published;
let tune: Published;
let handle: string;
let authorCookie: string;
let fanCookie: string;

beforeAll(async () => {
  ctx = await startAppContext();
  handle = (await ensureProfile(ctx.db, "mo-author")).handle;
  await ensureProfile(ctx.db, "mo-fan");
  await ctx.db.updateTable("profile").set({ display_name: "Pic Poster", notifications_seen_at: new Date(Date.now() - 60_000) }).where("user_id", "=", "mo-author").execute();
  pic = await publishAs(ctx, "mo-author", { version: 1, blocks: [{ type: "image", mediaId: await uploadAs(ctx, "mo-author", await smallPngWithAlpha()) }] });
  tune = await publishAs(ctx, "mo-author", { version: 1, blocks: [{ type: "audio", mediaId: await uploadAs(ctx, "mo-author", mp3Tone()) }] });
  authorCookie = (await startSession(ctx.db, "mo-author")).split(";")[0];
  fanCookie = (await startSession(ctx.db, "mo-fan")).split(";")[0];
  clearAsideCacheForTests();
});
afterAll(async () => ctx?.stop());

const get = (path: string, cookie = "", lang = "en") => new Request(`${BASE}${path}`, { headers: { "accept-language": lang, cookie: `ni_sso=1${cookie ? `; ${cookie}` : ""}` } });
const page = async (slug: string, lang = "en") => (await pageRoute(get(`/p/${slug}`, "", lang), params({ slug }))).text();
const feedCard = (html: string, slug: string) => {
  const start = html.indexOf(`<article class="ni-card ni-fc" data-href="/p/${slug}">`);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</article>", start));
};

describe("posts with images or audio only", () => {
  it("feed cards have no empty heading; Popular articles names them (No text), muted", async () => {
    const html = await (await discoverRoute(get("/discover"))).text();
    for (const slug of [pic.slug, tune.slug]) {
      expect(feedCard(html, slug)).not.toContain("<h3>");
      expect(html).toContain(`<a class="ni-mini ni-mini-text" href="/p/${slug}"><span><b><span class="ni-none">(No text)</span></b>`);
    }
  });

  it("post page: share title is the author, the other one in More articles is (No text) in the page language", async () => {
    const html = await page(pic.slug);
    expect(html).toContain(`<title>Pic Poster (@${handle}) · niceideas</title>`);
    expect(html).toContain(`<meta property="og:title" content="Pic Poster (@${handle})">`);
    expect(html).toContain(`<meta itemprop="name" content="Pic Poster (@${handle})">`);
    expect(html).toContain(`<a class="ni-mini" href="/p/${tune.slug}">`);
    expect(html).toContain('<b><span class="ni-none">(No text)</span></b>');
    expect(await page(pic.slug, "zh-CN")).toContain('<b><span class="ni-none">（无文字）</span></b>');
  });

  it("notifications keep a visible, clickable post link", async () => {
    await ctx.db.insertInto("post_like").values({ post_id: pic.id, liker_key: "v:mo-guest", user_id: null, ip_hash: "h" }).execute();
    const html = await (await notificationsRoute(get("/notifications", authorCookie))).text();
    expect(html).toContain(`<a class="ni-note-post" href="/p/${pic.slug}"><span class="ni-none">(No text)</span></a>`);
  });

  it("a quote of one shows no empty heading", async () => {
    const form = new FormData();
    form.set("text", "Look at this");
    form.set("quote", pic.slug);
    const res = await composeRoute(new Request(`${BASE}/api/web/compose`, { method: "POST", body: form, headers: { origin: BASE, cookie: fanCookie } }));
    const slug = res.headers.get("location")!.replace("/p/", "");
    const html = await page(slug);
    expect(html).toContain(`<a class="ni-qe" href="/p/${pic.slug}">`);
    expect(html).not.toContain("<h4></h4>");
  });
});
