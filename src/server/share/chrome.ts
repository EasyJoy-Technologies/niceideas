import { GLOSSARY } from "@/i18n/glossary";
import { LOCALES } from "@/i18n/locales";
import { escapeHtml } from "@/server/render/escape";
import { APP_VERSION } from "@/server/version";
import { icon } from "./icons";
import { LANG_PARAM, type PageIntl } from "./locale";
import { INFO_PAGES } from "./info-content";

/** Page context shared by every server-rendered page. */
export type ChromeContext = {
  intl: PageIntl;
  /** Mainland-China visitor: no in-site navigation at all (plan §4.2). */
  restricted: boolean;
  /** Path of the current page (language links stay on it). */
  path: string;
};

const LOCKUP = { src: "/brand/lockup.svg", width: 876, height: 168 };

const autonym = (code: string) => new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;

function brand(ctx: ChromeContext, heightRem: number): string {
  const w = ((LOCKUP.width / LOCKUP.height) * heightRem * 16).toFixed(0);
  const img = `<img src="${LOCKUP.src}" alt="${GLOSSARY.brand}" width="${w}" height="${heightRem * 16}">`;
  return ctx.restricted ? `<span class="ni-brand">${img}</span>` : `<a class="ni-brand" href="/">${img}</a>`;
}

/** No-JS language menu; links re-render the same page with `?hl=`. */
function languageMenu(ctx: ChromeContext): string {
  const { t, locale } = ctx.intl;
  const items = LOCALES.map((code) => {
    const current = code === locale ? ' aria-current="true"' : "";
    const href = `${ctx.path}?${LANG_PARAM}=${encodeURIComponent(code)}`;
    return `<li><a href="${escapeHtml(href)}" hreflang="${code}" lang="${code}"${current}>${escapeHtml(autonym(code))}</a></li>`;
  }).join("");
  return (
    `<details class="ni-lang"><summary aria-label="${escapeHtml(t("share.language"))}">${icon("globe")}` +
    `<span>${escapeHtml(autonym(locale))}</span></summary><ul>${items}</ul></details>`
  );
}

export function siteHeader(ctx: ChromeContext): string {
  const join = ctx.restricted
    ? ""
    : `<a class="ni-btn ni-btn-primary" href="/">${escapeHtml(ctx.intl.t("share.header.join", { brand: GLOSSARY.brand }))}</a>`;
  // Mainland-China visitors get no in-site navigation (plan §4.2).
  const current = ctx.path === "/discover" || ctx.path === "/" ? ' aria-current="page"' : "";
  const discover = ctx.restricted ? "" : `<a class="ni-hdr-nav" href="/discover"${current}>${escapeHtml(ctx.intl.t("discover.title"))}</a>`;
  return `<header class="ni-hdr"><div class="ni-hdr-in">${brand(ctx, 1.875)}<span class="ni-sp"></span>${discover}${languageMenu(ctx)}${join}</div></header>`;
}

/** Footer per approved v2 design: brand + tagline, site links, © · version + language. */
export function siteFooter(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  // Mainland-China visitors get no in-site links (plan §4.2).
  const links = ctx.restricted
    ? ""
    : `<nav class="ni-ftr-links">${INFO_PAGES.map((p) => `<a href="/${p}">${escapeHtml(t(`info.${p}.title`, { brand: GLOSSARY.brand }))}</a>`).join("")}</nav>`;
  const year = new Date().getUTCFullYear();
  const meta =
    `<div class="ni-ftr-meta"><span>© ${year} ${GLOSSARY.brand} · ${escapeHtml(t("common.footer.version", { version: APP_VERSION }))}</span>` +
    `${languageMenu(ctx)}</div>`;
  return (
    `<footer class="ni-ftr"><div class="ni-ftr-in"><div class="ni-ftr-brand">${brand(ctx, 1.625)}` +
    `<p>${escapeHtml(t("common.tagline"))}</p></div>${links}${meta}</div></footer>`
  );
}
