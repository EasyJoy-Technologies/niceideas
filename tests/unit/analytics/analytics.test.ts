import { afterEach, describe, expect, it } from "vitest";
import { analyticsCspSources, analyticsIds } from "@/server/analytics/analytics";
import { getConfig, resetConfigForTests } from "@/server/config/env";
import { pageIntl } from "@/server/share/locale";
import type { ChromeContext } from "@/server/share/chrome";
import { consentSettingsButton, pageConsent } from "@/server/share/consent";
import { renderPage } from "@/server/share/document";
import { offeredCategories } from "@/server/consent/categories";

process.env.DATABASE_URL ??= "postgres://unused@localhost/unused";

const setIds = (ga4: string, clarity: string) => {
  process.env.ANALYTICS_GA4_ID = ga4;
  process.env.ANALYTICS_CLARITY_ID = clarity;
  resetConfigForTests();
};
afterEach(() => setIds("", ""));

const context = async (restricted = false): Promise<ChromeContext> => ({ intl: await pageIntl("en"), restricted, path: "/", theme: "auto" });

describe("analytics configuration", () => {
  it("is off without ids: no extra CSP sources, no banner, no button", async () => {
    setIds("", "");
    expect(analyticsIds()).toBeNull();
    expect(offeredCategories()).toEqual([]);
    expect(analyticsCspSources("script-src")).toBe("");
    const ctx = await context();
    expect(pageConsent(ctx)).toBeNull();
    expect(consentSettingsButton(ctx)).toBe("");
    const html = renderPage(ctx, { title: "t", main: "<main></main>" });
    expect(html).not.toContain("consent.js");
    expect(html).not.toContain("data-clarity-mask");
  });

  it("rejects malformed ids", () => {
    process.env.ANALYTICS_GA4_ID = "UA-123";
    resetConfigForTests();
    expect(() => getConfig()).toThrow(/ANALYTICS_GA4_ID/);
    process.env.ANALYTICS_GA4_ID = "";
    process.env.ANALYTICS_CLARITY_ID = "bad id!";
    resetConfigForTests();
    expect(() => getConfig()).toThrow(/ANALYTICS_CLARITY_ID/);
  });

  it("allows only the configured vendors in the CSP", () => {
    setIds("G-ABC1234", "");
    expect(analyticsCspSources("script-src")).toBe(" https://www.googletagmanager.com");
    expect(analyticsCspSources("connect-src")).not.toContain("clarity");
    setIds("", "abc123xyz0");
    expect(analyticsCspSources("script-src")).toBe(" https://www.clarity.ms https://*.clarity.ms");
    setIds("G-ABC1234", "abc123xyz0");
    expect(analyticsCspSources("connect-src")).toContain("https://*.google-analytics.com");
    expect(analyticsCspSources("connect-src")).toContain("https://*.clarity.ms");
  });
});

describe("consent banner", () => {
  it("renders the hidden banner, ids and full Clarity masking on pages that offer analytics", async () => {
    setIds("G-ABC1234", "abc123xyz0");
    const html = renderPage(await context(), { title: "t", main: "<main></main>" });
    expect(html).toMatch(/<body [^>]*data-ga4="G-ABC1234" data-clarity="abc123xyz0" data-clarity-mask="True"/);
    expect(html).toContain('<section class="ni-consent" id="ni-consent" aria-labelledby="ni-consent-t" data-consent-v="1" data-consent-cats="analytics" hidden>');
    expect(html).toContain('data-consent-act="reject">Reject all<');
    expect(html).toContain('data-consent-act="accept">Accept all<');
    expect(html).toContain('data-consent-act="customize" aria-expanded="false" aria-controls="ni-consent-p">Customize<');
    // Generic first layer: no vendor names; categories: necessary (locked) + analytics, no advertising yet.
    const banner = html.slice(html.indexOf('<section class="ni-consent"'));
    expect(banner).not.toMatch(/Google|Clarity/);
    expect(banner).toContain('<input type="checkbox" checked disabled>');
    expect(banner).toContain('<input type="checkbox" data-consent-cat="analytics">');
    expect(banner).not.toContain('data-consent-cat="ads"');
    expect(html).toContain('<a href="/privacy#s5">Privacy policy</a>');
    expect(html).toMatch(/<script src="\/scripts\/consent\.js\?v=[^"]+" defer>/);
    expect(html).toMatch(/<link rel="stylesheet" href="\/styles\/consent\.css\?v=/);
    // No third-party script is referenced by the page itself.
    expect(html).not.toMatch(/googletagmanager|clarity\.ms/);
  });

  it("is left out of opted-out pages (settings) and for mainland-China visitors", async () => {
    setIds("G-ABC1234", "abc123xyz0");
    expect(renderPage(await context(), { title: "t", main: "", analytics: false })).not.toContain("ni-consent");
    const restricted = await context(true);
    expect(pageConsent(restricted)).toBeNull();
    expect(consentSettingsButton(restricted)).toBe("");
    expect(consentSettingsButton(await context())).toContain("data-consent-open hidden>Cookie settings<");
  });
});
