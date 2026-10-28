import { analyticsIds } from "@/server/analytics/analytics";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";

/** Same-origin assets of the consent banner (loaded only on pages that offer analytics). */
export const CONSENT_SCRIPT = "/scripts/consent.js";
export const CONSENT_STYLE = "/styles/consent.css";

export type PageConsent = {
  /** `<body>` attributes read by consent.js (ids) and Clarity (mask every text on the page). */
  bodyAttrs: string;
  /** Banner markup, hidden until consent.js finds no stored choice. */
  banner: string;
};

/**
 * Analytics may run on this page: a tool is configured, the visitor is not in mainland China
 * (restricted chrome: no privacy page to manage the choice) and the page did not opt out (settings).
 */
export function analyticsOffered(ctx: ChromeContext, wanted = true): boolean {
  return wanted && !ctx.restricted && analyticsIds() !== null;
}

/** Cookie banner: equal-weight Reject / Accept, link to the cookie section of the privacy policy. */
function consentBanner(ctx: ChromeContext): string {
  const t = (key: string) => escapeHtml(ctx.intl.t(`consent.${key}`));
  return (
    `<section class="ni-consent" id="ni-consent" aria-labelledby="ni-consent-t" hidden>` +
    `<p class="ni-consent-t" id="ni-consent-t">${t("title")}</p>` +
    `<p class="ni-consent-x">${t("text")} <a href="/privacy#s5">${escapeHtml(ctx.intl.t("info.privacy.title"))}</a></p>` +
    `<div class="ni-consent-b"><button type="button" class="ni-btn ni-btn-primary ni-btn-sm" data-consent="denied">${t("reject")}</button>` +
    `<button type="button" class="ni-btn ni-btn-primary ni-btn-sm" data-consent="granted">${t("accept")}</button></div></section>`
  );
}

/** Consent parts of a page, or null when the page offers no analytics. */
export function pageConsent(ctx: ChromeContext, wanted = true): PageConsent | null {
  const ids = analyticsIds();
  if (!ids || !analyticsOffered(ctx, wanted)) return null;
  return {
    bodyAttrs: ` data-ga4="${escapeHtml(ids.ga4)}" data-clarity="${escapeHtml(ids.clarity)}" data-clarity-mask="True"`,
    banner: consentBanner(ctx),
  };
}

/** "Cookie settings" button (privacy page): reopens the banner; shown by consent.js. */
export function consentSettingsButton(ctx: ChromeContext): string {
  if (!analyticsOffered(ctx)) return "";
  return `<button type="button" class="ni-btn ni-btn-ghost ni-btn-sm" data-consent-open hidden>${escapeHtml(ctx.intl.t("consent.settings"))}</button>`;
}
