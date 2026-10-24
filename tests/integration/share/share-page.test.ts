import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { GET as ogRoute } from "@/app/p/[slug]/og/[variant]/route";
import { GET as regionRoute } from "@/app/status/region/route";
import { config as proxyConfig, proxy } from "@/proxy";
import { REGION_BLOCK_HEADER, SITE_PATH_EXCLUSIONS } from "@/server/region/region-header";
import { GET as termsRoute } from "@/app/terms/route";
import { GET as langRoute } from "@/app/api/web/lang/route";
import { startAppContext } from "../../helpers/app-context";
import { params } from "../../helpers/api";
import { deleteAs, publishAs, shareFromNiceNote, uploadAs } from "../../helpers/publish";
import { jpegWithExif } from "../../helpers/media-fixtures";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  ctx = await startAppContext();
});
afterAll(async () => ctx?.stop());

const page = (slug: string, headers: Record<string, string> = {}, query = "") =>
  pageRoute(new Request(`http://localhost:3000/p/${slug}${query}`, { headers }), params({ slug }));
const og = (slug: string, variant: string, headers: Record<string, string> = {}) =>
  ogRoute(new Request(`http://localhost:3000/p/${slug}/og/${variant}`, { headers }), params({ slug, variant }));
const publish = (document: unknown, sourceRef: string) => publishAs(ctx, "author-1", document, sourceRef);
const upload = (buf: Buffer) => uploadAs(ctx, "author-1", buf);

describe("share page /p/<slug>", () => {
  let short: { id: string; slug: string };
  let article: { id: string; slug: string };

  beforeAll(async () => {
    short = await shareFromNiceNote(ctx, "author-1", { version: 1, blocks: [{ type: "text", text: "A <b>nice</b> idea" }] });
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

  it("remembers a language menu choice in a cookie and returns to the same page", async () => {
    const html = await (await termsRoute(new Request("http://localhost:3000/terms", { headers: { "accept-language": "en" } }))).text();
    expect(html).toContain('href="/api/web/lang?hl=de&amp;next=%2Fterms"');
    const res = langRoute(new Request("http://localhost:3000/api/web/lang?hl=de&next=%2Fterms"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/terms");
    expect(res.headers.get("set-cookie")).toMatch(/^ni_locale=de; Path=\/; Max-Age=31536000/);
    const next = await (await termsRoute(new Request("http://localhost:3000/terms", { headers: { "accept-language": "en", cookie: "ni_locale=de" } }))).text();
    expect(next).toContain('<h1 class="ni-title">Nutzungsbedingungen</h1>');
    for (const bad of ["https://evil.test/", "//evil.test", "/\\evil.test"]) {
      expect(langRoute(new Request(`http://localhost:3000/api/web/lang?hl=de&next=${encodeURIComponent(bad)}`)).headers.get("location")).toBe("/");
    }
    expect(langRoute(new Request("http://localhost:3000/api/web/lang?hl=xx&next=%2F")).headers.get("set-cookie")).toBeNull();
  });

  it("uses cover-based share images for posts with images", async () => {
    const html = await (await page(article.slug)).text();
    expect(html).toContain('<h1 class="ni-title">Lake trip</h1>');
    expect(html).toMatch(new RegExp(`og:image" content="http://localhost:3000/p/${article.slug}/og/wide\\.jpg\\?v=[a-z0-9]+"`));
    expect(html).toMatch(new RegExp(`itemprop="image" content="http://localhost:3000/p/${article.slug}/og/square\\.jpg`));
    // Images open the viewer: its script, styles and labels come with the page.
    expect(html).toMatch(/<a class="ni-zoom" href="[^"]+" data-pswp-width="\d+" data-pswp-height="\d+" data-pswp-srcset="/);
    expect(html).toContain('src="/scripts/viewer.js?v=');
    expect(html).toContain('href="/styles/photoswipe.css?v=');
    expect(html).toContain('data-zoom-label="Zoom"');
    expect(html).toContain('data-image-error-label="The image couldn&#39;t be loaded"');
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

  it("unknown / malformed slugs → 404, deleted → 410 without card tags", async () => {
    expect((await page("zzzzzzzzzzzzzz")).status).toBe(404);
    expect((await page("bad slug!")).status).toBe(404);
    expect((await deleteAs(ctx, short.id)).changed).toBe(true);
    const gone = await page(short.slug, { "accept-language": "en" });
    expect(gone.status).toBe(410);
    const html = await gone.text();
    expect(html).toContain("This post was deleted");
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
    expect(html).toMatch(/<span class="ni-pill">[^<]*24[^<]*<\/span>/);
    expect(html).not.toContain("ni-btn-primary");
    // Round 5: page links in a header hamburger (icon, labelled); theme menu next to the language.
    expect(html).toContain('<details class="ni-menu ni-info-more"><summary aria-label="Über uns &amp; Bedingungen"');
    expect(html).toContain('<details class="ni-menu ni-theme">');
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
