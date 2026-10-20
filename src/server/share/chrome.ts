import { GLOSSARY } from "@/i18n/glossary";
import { LOCALES } from "@/i18n/locales";
import { escapeHtml } from "@/server/render/escape";
import { APP_VERSION } from "@/server/version";
import { icon } from "./icons";
import { LANG_PARAM, type PageIntl } from "./locale";
import { nicenoteHome } from "./sources";

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
  return `<header class="ni-hdr"><div class="ni-hdr-in">${brand(ctx, 1.875)}<span class="ni-sp"></span>${languageMenu(ctx)}${join}</div></header>`;
}

export function siteFooter(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const app = t("common.brand.nicenote");
  const links = ctx.restricted
    ? ""
    : `<nav class="ni-ftr-links"><a href="${escapeHtml(nicenoteHome("footer"))}" target="_blank" rel="noopener">${escapeHtml(t("share.footer.getApp", { app }))}</a></nav>`;
  const year = new Date().getUTCFullYear();
  const meta = `<span>© ${year} ${GLOSSARY.brand} · ${escapeHtml(t("common.footer.version", { version: APP_VERSION }))}</span>`;
  return (
    `<footer class="ni-ftr"><div class="ni-ftr-in"><div class="ni-ftr-brand">${brand(ctx, 1.625)}` +
    `<p>${escapeHtml(t("common.tagline"))}</p></div>${links}<div class="ni-ftr-meta">${meta}</div></div></footer>`
  );
}
