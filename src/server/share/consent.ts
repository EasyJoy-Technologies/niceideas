import { analyticsIds } from "@/server/analytics/analytics";
import { CONSENT_VERSION, offeredCategories, type ConsentCategory } from "@/server/consent/categories";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";

/** Same-origin assets of the cookie banner (loaded only on pages that offer optional cookies). */
export const CONSENT_SCRIPT = "/scripts/consent.js";
export const CONSENT_STYLE = "/styles/consent.css";

export type PageConsent = {
  /** `<body>` attributes read by consent.js (vendor ids) and Clarity (mask every text on the page). */
  bodyAttrs: string;
  /** Banner markup, hidden until consent.js finds no valid stored choice. */
  banner: string;
};

/**
 * Optional cookies may be used on this page: a category is offered (a vendor is configured), the
 * visitor is not in mainland China (restricted chrome: no privacy page to manage the choice) and
 * the page did not opt out (settings).
 */
export function consentOffered(ctx: ChromeContext, wanted = true): boolean {
  return wanted && !ctx.restricted && offeredCategories().length > 0;
}

/** One category row of the "Customize" panel; necessary cookies: checked and locked. */
function categoryRow(ctx: ChromeContext, category: ConsentCategory | "necessary"): string {
  const t = (key: string) => escapeHtml(ctx.intl.t(key));
  const locked = category === "necessary";
  const box = locked ? `<input type="checkbox" checked disabled>` : `<input type="checkbox" data-consent-cat="${category}">`;
  const always = locked ? ` <span class="ni-consent-on">${t("consent.alwaysOn")}</span>` : "";
  return (
    `<label class="ni-consent-c">${box}<span><span class="ni-consent-n">${t(`consent.cat.${category}.title`)}${always}</span>` +
    `<span class="ni-consent-d">${t(`consent.cat.${category}.text`)}</span></span></label>`
  );
}

/**
 * Cookie banner. First layer: generic text, equal-weight "Reject all" / "Accept all", "Customize";
 * second layer (panel): one switch per offered category, "Save choices". consent.js reads the
 * request version and offered categories from data-* to decide whether to ask again.
 */
function consentBanner(ctx: ChromeContext, offered: ConsentCategory[]): string {
  const t = (key: string) => escapeHtml(ctx.intl.t(`consent.${key}`));
  const rows = (["necessary", ...offered] as const).map((c) => categoryRow(ctx, c)).join("");
  const btn = (act: string, cls: string, label: string, extra = "") =>
    `<button type="button" class="ni-btn ${cls} ni-btn-sm" data-consent-act="${act}"${extra}>${t(label)}</button>`;
  return (
    `<section class="ni-consent" id="ni-consent" aria-labelledby="ni-consent-t" data-consent-v="${CONSENT_VERSION}" data-consent-cats="${offered.join(" ")}" hidden>` +
    `<p class="ni-consent-t" id="ni-consent-t">${t("title")}</p>` +
    `<p class="ni-consent-x">${t("text")} <a href="/privacy#s5">${escapeHtml(ctx.intl.t("info.privacy.title"))}</a></p>` +
    `<div class="ni-consent-p" id="ni-consent-p" role="group" aria-labelledby="ni-consent-t" hidden>${rows}</div>` +
    `<div class="ni-consent-b">${btn("reject", "ni-btn-primary", "rejectAll")}${btn("accept", "ni-btn-primary", "acceptAll")}` +
    `${btn("customize", "ni-btn-ghost ni-consent-w", "customize", ` aria-expanded="false" aria-controls="ni-consent-p"`)}` +
    `${btn("save", "ni-btn-ghost ni-consent-w", "save", " hidden")}</div></section>`
  );
}

/** Consent parts of a page, or null when the page offers no optional cookies. */
export function pageConsent(ctx: ChromeContext, wanted = true): PageConsent | null {
  if (!consentOffered(ctx, wanted)) return null;
  const ids = analyticsIds();
  const vendors = ids ? ` data-ga4="${escapeHtml(ids.ga4)}" data-clarity="${escapeHtml(ids.clarity)}" data-clarity-mask="True"` : "";
  return { bodyAttrs: vendors, banner: consentBanner(ctx, offeredCategories()) };
}

/** "Cookie settings" button (privacy page): reopens the banner with the choices; shown by consent.js. */
export function consentSettingsButton(ctx: ChromeContext): string {
  if (!consentOffered(ctx)) return "";
  return `<button type="button" class="ni-btn ni-btn-ghost ni-btn-sm" data-consent-open hidden>${escapeHtml(ctx.intl.t("consent.settings"))}</button>`;
}
