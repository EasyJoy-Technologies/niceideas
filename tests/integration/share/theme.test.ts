import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as termsRoute } from "@/app/terms/route";
import { GET as themeRoute } from "@/app/api/web/theme/route";
import { GET as postRoute } from "@/app/p/[slug]/route";
import { startAppContext } from "../../helpers/app-context";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  ctx = await startAppContext();
});
afterAll(async () => ctx?.stop());

const page = async (cookie = "") =>
  (await discoverRoute(new Request("http://localhost:3000/discover", { headers: { "accept-language": "en", cookie: `ni_sso=1; ${cookie}` } }))).text();

describe("theme (dark mode)", () => {
  it("follows the system by default: dark stylesheet only for prefers-color-scheme: dark", async () => {
    const html = await page();
    expect(html).toMatch(/<link rel="stylesheet" href="\/styles\/dark\.css\?v=[^"]+" media="\(prefers-color-scheme: dark\)">/);
    expect(html).toContain('<source media="(prefers-color-scheme: dark)" srcset="/brand/lockup-dark.svg">');
    expect(html).toContain('<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">');
    expect(html).toContain('<details class="ni-menu ni-theme">');
  });

  it("cookie dark / light picks the palette on the server (no flash)", async () => {
    const dark = await page("ni_theme=dark");
    expect(dark).toMatch(/<link rel="stylesheet" href="\/styles\/dark\.css\?v=[^"]+">/);
    expect(dark).toContain('src="/brand/lockup-dark.svg"');
    expect(dark).toContain('href="/api/web/theme?t=dark&amp;next=%2Fdiscover" rel="nofollow" aria-current="true"');
    const light = await page("ni_theme=light");
    expect(light).not.toContain("dark.css");
    expect(light).toContain('<meta name="theme-color" content="#ffffff">');
  });

  it("the theme route remembers a valid choice and returns to a same-site path only", async () => {
    const res = await themeRoute(new Request("http://localhost:3000/api/web/theme?t=dark&next=%2Fterms"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/terms");
    expect(res.headers.get("set-cookie")).toMatch(/^ni_theme=dark; Path=\/; Max-Age=31536000/);
    const bad = await themeRoute(new Request("http://localhost:3000/api/web/theme?t=neon&next=%2F%2Fevil.test"));
    expect(bad.headers.get("location")).toBe("/");
    expect(bad.headers.get("set-cookie")).toBeNull();
  });

  it("?theme= on a post link (apps opening their own post) remembers the theme and drops the parameter", async () => {
    const open = (q: string) => postRoute(new Request(`http://localhost:3000/p/abc123${q}`), { params: Promise.resolve({ slug: "abc123" }) } as never);
    const dark = await open("?theme=dark&n=x");
    expect(dark.status).toBe(303);
    expect(dark.headers.get("location")).toBe("/p/abc123?n=x");
    expect(dark.headers.get("set-cookie")).toMatch(/^ni_theme=dark; Path=\/; Max-Age=31536000/);
    expect(dark.headers.get("cache-control")).toBe("no-store");
    const light = await open("?theme=light");
    expect(light.headers.get("location")).toBe("/p/abc123");
    expect(light.headers.get("set-cookie")).toMatch(/^ni_theme=light;/);
    const bad = await open("?theme=neon");
    expect(bad.headers.get("location")).toBe("/p/abc123");
    expect(bad.headers.get("set-cookie")).toBeNull();
  });

  it("signed-out phone tab bar has no compose button; info pages carry the hamburger", async () => {
    const html = await page();
    expect(html).toContain('<nav class="ni-tabbar ni-tabbar-2">');
    expect(html).not.toContain("ni-tab-plus");
    expect(html).not.toContain("tab=images");
    expect(html).toContain('<details class="ni-hdr-find">');
    const terms = await (await termsRoute(new Request("http://localhost:3000/terms", { headers: { "accept-language": "en" } }))).text();
    expect(terms).toContain('class="ni-menu ni-info-more"');
    expect(terms).not.toContain("ni-tabbar");
  });
});
