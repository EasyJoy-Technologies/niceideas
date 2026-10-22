import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE } from "@/app/api/v1/posts/[id]/route";
import { POST as mediaRoute } from "@/app/api/v1/media/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { GET as ogRoute } from "@/app/p/[slug]/og/[variant]/route";
import { GET as regionRoute } from "@/app/status/region/route";
import { config as proxyConfig, proxy } from "@/proxy";
import { REGION_BLOCK_HEADER, SITE_PATH_EXCLUSIONS } from "@/server/region/region-header";
import { GET as termsRoute } from "@/app/terms/route";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";
import { jpegWithExif, sha256 } from "../../helpers/media-fixtures";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
let token: string;
beforeAll(async () => {
  ctx = await startAppContext();
  token = await ctx.tokenFor("author-1");
});
afterAll(async () => ctx?.stop());

const T = "2026-10-19T10:00:00Z";
const page = (slug: string, headers: Record<string, string> = {}, query = "") =>
  pageRoute(new Request(`http://localhost:3000/p/${slug}${query}`, { headers }), params({ slug }));
const og = (slug: string, variant: string, headers: Record<string, string> = {}) =>
  ogRoute(new Request(`http://localhost:3000/p/${slug}/og/${variant}`, { headers }), params({ slug, variant }));
async function publish(document: unknown, sourceRef: string) {
  const res = await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document, sourceRef, sourceUpdatedAt: T }), {});
  return (await res.json()).post as { id: string; slug: string };
}
async function upload(buf: Buffer) {
  const req = new Request("http://x/api/v1/media", { method: "POST", body: new Uint8Array(buf), headers: { authorization: `Bearer ${token}`, "x-content-sha256": sha256(buf) } });
  return (await (await mediaRoute(req, {})).json()).media.id as string;
}

describe("share page /p/<slug>", () => {
  let short: { id: string; slug: string };
  let article: { id: string; slug: string };

  beforeAll(async () => {
    short = await publish({ version: 1, blocks: [{ type: "text", text: "A <b>nice</b> idea" }] }, "s1");
    const img = await upload(await jpegWithExif());
    article = await publish({ version: 1, title: "Lake trip", blocks: [{ type: "text", text: "Morning fog." }, { type: "image", mediaId: img, caption: "Lake" }] }, "a1");
  });

  it("renders a short post as safe server HTML with share-card tags and the NiceNote source badge", async () => {
    const res = await page(short.slug, { "accept-language": "en" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    const html = await res.text();
    expect(html).toContain("A &lt;b&gt;nice&lt;/b&gt; idea");
    expect(html).not.toContain("<b>nice</b>");
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain(`<link rel="canonical" href="http://localhost:3000/p/${short.slug}">`);
    expect(html).toContain('<meta property="og:title" content="A &lt;b&gt;nice&lt;/b&gt; idea">');
    expect(html).toContain('<meta property="og:image" content="http://localhost:3000/brand/og-default.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain("From NiceNote");
    expect(html).toContain("https://enp.ej-mobile.cn/?utm_source=niceideas&amp;utm_medium=post_source");
    expect(html).toContain('class="ni-post ni-short"');
    expect(html).toContain('<a class="ni-brand" href="/">');
    // Footer per approved design: site links, no NiceNote store link (only the source badge links there).
    for (const page of ["about", "guidelines", "terms", "privacy", "help"]) expect(html).toContain(`<a href="/${page}">`);
    expect(html.match(/enp\.ej-mobile\.cn/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script>|style="/);
  });

  it("follows the visitor language (?hl, cookie, Accept-Language) and mirrors RTL", async () => {
    expect(await (await page(short.slug, { "accept-language": "zh-CN" })).text()).toContain("来自 乐趣记事本");
    expect(await (await page(short.slug, { cookie: "ni_locale=zh-Hant" })).text()).toContain("來自 樂趣記事本");
    const ar = await (await page(short.slug, {}, "?hl=ar")).text();
    expect(ar).toContain('<html lang="ar" dir="rtl">');
  });

  it("uses cover-based share images for posts with images", async () => {
    const html = await (await page(article.slug)).text();
    expect(html).toContain('<h1 class="ni-title">Lake trip</h1>');
    expect(html).toMatch(new RegExp(`og:image" content="http://localhost:3000/p/${article.slug}/og/wide\\.jpg\\?v=[a-z0-9]+"`));
    expect(html).toMatch(new RegExp(`itemprop="image" content="http://localhost:3000/p/${article.slug}/og/square\\.jpg`));
    expect(html).toContain("data-lightbox");
  });

  it("share images are JPEG, exact size, ≤ 300 KB; unknown variants 404", async () => {
    for (const [variant, w, h] of [["wide.jpg", 1200, 630], ["square.jpg", 600, 600]] as const) {
      const res = await og(article.slug, variant, { "cf-ipcountry": "CN" });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBeLessThanOrEqual(300 * 1024);
      expect(await sharp(buf).metadata()).toMatchObject({ format: "jpeg", width: w, height: h });
    }
    expect((await og(article.slug, "x.png")).status).toBe(404);
    expect((await og(short.slug, "wide.jpg")).status).toBe(404);
  });

  it("mainland China: page still opens, but without any in-site navigation", async () => {
    const res = await page(short.slug, { "cf-ipcountry": "CN" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('href="/"');
    expect(html).toContain('<span class="ni-brand">');
    expect(html).toContain("enp.ej-mobile.cn");
  });

  it("unknown / malformed slugs → 404, withdrawn → 410 without card tags", async () => {
    expect((await page("zzzzzzzzzzzzzz")).status).toBe(404);
    expect((await page("bad slug!")).status).toBe(404);
    const del = await DELETE(jsonRequest("DELETE", `/api/v1/posts/${short.id}`, token), params({ id: short.id }));
    expect(del.status).toBe(200);
    const gone = await page(short.slug, { "accept-language": "en" });
    expect(gone.status).toBe(410);
    const html = await gone.text();
    expect(html).toContain("This post was withdrawn");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain("og:title");
  });
});

describe("information pages", () => {
  it("render in the visitor language with the site chrome", async () => {
    const res = await termsRoute(new Request("http://localhost:3000/terms", { headers: { "accept-language": "de" } }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1 class="ni-title">Nutzungsbedingungen</h1>');
    expect(html).toContain('class="ni-toc"');
    expect(html).toContain('<section id="s1">');
    expect(html).toContain("support@nicematrix.ca");
    expect(html).toContain('<a href="/terms" aria-current="page">');
    expect(html).not.toMatch(/TO CONFIRM|待确认/);
    // v4.1: no back button (the logo links home); phone footer links in a pop-up menu.
    expect(html).toContain('<a class="ni-brand" href="/">');
    expect(html).toMatch(/<span class="ni-pill">[^<]*21[^<]*<\/span>/);
    expect(html).not.toContain("ni-btn-primary");
    expect(html).toContain('<details class="ni-menu ni-info-more"><summary>Über uns &amp; Bedingungen</summary>');
  });

  it("serves every legal document in every locale without placeholders", async () => {
    const { LOCALES } = await import("@/i18n/locales");
    const { LEGAL_DOCS, loadLegalDocument } = await import("@/server/legal/legal-docs");
    for (const doc of LEGAL_DOCS)
      for (const locale of LOCALES) {
        const d = loadLegalDocument(doc, locale);
        expect(d.sections.length).toBe(doc === "terms" ? 18 : 16);
        expect(d.summaryHtml).toContain("<strong>");
      }
  });
});

describe("page-level mainland-China rule", () => {
  const req = (path: string, country?: string) =>
    new NextRequest(`http://localhost:3000${path}`, { headers: country ? { "cf-ipcountry": country } : {} });

  it("marks site pages of CN visitors for the 451 rewrite, and drops forged markers", () => {
    const marked = (r: NextRequest) => proxy(r).headers.get(`x-middleware-request-${REGION_BLOCK_HEADER}`);
    expect(marked(req("/", "CN"))).toBe("1");
    expect(marked(req("/terms", "CN"))).toBe("1");
    expect(marked(req("/", "HK"))).toBeNull();
    expect(marked(req("/"))).toBeNull();
    const forged = new NextRequest("http://localhost:3000/", { headers: { [REGION_BLOCK_HEADER]: "1" } });
    expect(marked(forged)).toBeNull();
    expect(proxy(forged).headers.get("x-middleware-override-headers")).not.toContain(REGION_BLOCK_HEADER);
  });

  it("the 451 rewrite covers exactly the proxy's paths", () => {
    expect(proxyConfig.matcher).toEqual([`/(${SITE_PATH_EXCLUSIONS}.*)`]);
  });

  it("451 page has no in-site links", async () => {
    const res = await regionRoute(new Request("http://localhost:3000/status/region", { headers: { "accept-language": "zh-CN", "cf-ipcountry": "CN" } }));
    expect(res.status).toBe(451);
    const html = await res.text();
    expect(html).toContain("此页面在你所在的地区不可用");
    expect(html).not.toContain('href="/"');
  });
});
