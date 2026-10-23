import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE } from "@/app/api/v1/posts/[id]/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as profileRoute } from "@/app/u/[handle]/route";
import { FEED_PAGE_SIZE, readingMinutes } from "@/server/share/load-feed";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
let token: string;
let handle: string;
beforeAll(async () => {
  ctx = await startAppContext();
  token = await ctx.tokenFor("feed-author");
});
afterAll(async () => ctx?.stop());

const T = "2026-10-20T10:00:00Z";
async function publish(document: unknown, sourceRef: string) {
  const res = await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document, sourceRef, sourceUpdatedAt: T }), {});
  return (await res.json()).post as { id: string; slug: string };
}
const discover = async (query = "", headers: Record<string, string> = {}) => {
  const res = await discoverRoute(new Request(`http://localhost:3000/discover${query}`, { headers: { "accept-language": "en", ...headers } }));
  return { status: res.status, html: await res.text() };
};
const profile = async (h: string, query = "") => {
  const res = await profileRoute(new Request(`http://localhost:3000/u/${h}${query}`, { headers: { "accept-language": "en" } }), params({ handle: h }));
  return { status: res.status, html: await res.text() };
};

describe("discover and profile pages", () => {
  let short: { id: string; slug: string };
  let article: { id: string; slug: string };

  beforeAll(async () => {
    short = await publish({ version: 1, blocks: [{ type: "text", text: "Feed <b>short</b> idea" }] }, "f-short");
    article = await publish({ version: 1, title: "Long read", blocks: [{ type: "text", text: "word ".repeat(600) }] }, "f-article");
    handle = (await ctx.db.selectFrom("profile").select("handle").where("user_id", "=", "feed-author").executeTakeFirstOrThrow()).handle;
  });

  it("discover lists live posts newest first: short posts in full (escaped), articles as cards", async () => {
    const { status, html } = await discover();
    expect(status).toBe(200);
    expect(html).toContain("Feed &lt;b&gt;short&lt;/b&gt; idea");
    expect(html).not.toContain("<b>short</b>");
    expect(html.indexOf(`/p/${article.slug}"`)).toBeLessThan(html.indexOf(`data-id="${short.slug}"`));
    expect(html).toContain("Long read");
    expect(html).toContain("3 min read");
    expect(html).toContain(`href="/@${handle}"`);
    expect(html).toContain("From NiceNote");
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/discover">');
  });

  it("tabs filter by kind", async () => {
    const { html } = await discover("?tab=articles");
    expect(html).toContain("Long read");
    expect(html).not.toContain("Feed &lt;b&gt;short");
    // The "images" tab was removed (2026-10-22); old links fall back to "all".
    expect((await discover("?tab=images")).html).toContain("Feed &lt;b&gt;short");
  });

  it("pages with a keyset cursor", async () => {
    for (let i = 0; i < FEED_PAGE_SIZE; i++) await publish({ version: 1, blocks: [{ type: "text", text: `filler ${i}` }] }, `fill-${i}`);
    const first = await discover();
    const more = first.html.match(/href="\/discover\?before=([^"]+)"/);
    expect(more).not.toBeNull();
    const second = await discover(`?before=${more![1]}`);
    expect(second.html).toContain("Long read");
    expect(second.html).not.toContain("filler 19");
    expect((await discover("?before=garbage")).status).toBe(200);
  });

  it("profile shows the card, stats and the author's posts; unknown handles are 404", async () => {
    const { status, html } = await profile(handle);
    expect(status).toBe(200);
    expect(html).toContain(`@${handle}`);
    expect(html).toMatch(/<b>22<\/b> Posts/);
    expect(html).toContain("Joined October 2026");
    expect(html).toContain(`<link rel="canonical" href="http://localhost:3000/@${handle}">`);
    const missing = await profile("nobody_here");
    expect(missing.status).toBe(404);
    expect(missing.html).toContain("Account not found");
    expect((await profile("../etc")).status).toBe(404);
    expect((await profile("..")).status).toBe(404);
  });

  it("serves handles containing dots (NiceMatrix usernames)", async () => {
    await ctx.db.updateTable("profile").set({ handle: "dot.ted_user" }).where("user_id", "=", "feed-author").execute();
    const { status, html } = await profile("Dot.Ted_User");
    expect(status).toBe(200);
    expect(html).toContain("@dot.ted_user");
    await ctx.db.updateTable("profile").set({ handle }).where("user_id", "=", "feed-author").execute();
  });

  it("withdrawn posts leave the feeds", async () => {
    await DELETE(jsonRequest("DELETE", `/api/v1/posts/${short.id}`, token), params({ id: short.id }));
    expect((await discover("?tab=all")).html).not.toContain(`data-id="${short.slug}"`);
    expect((await profile(handle)).html).toMatch(/<b>21<\/b> Posts/);
  });

  it("feeds have no in-site header link for mainland-China visitors", async () => {
    // The page itself is blocked by the proxy marker + rewrite (see share-page.test.ts).
    expect((await discover("", { "cf-ipcountry": "CN" })).html).not.toContain("ni-hdr-nav");
    expect((await discover()).html).toContain('class="ni-hdr-nav ni-tabbed" href="/discover" aria-label="Discover" aria-current="page"');
  });

  it("estimates reading time for latin and CJK text", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("word ".repeat(440))).toBe(2);
    expect(readingMinutes("字".repeat(1200))).toBe(3);
  });
});
