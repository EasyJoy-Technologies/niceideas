import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import { brand, languageMenu, type ChromeContext } from "./chrome";
import { INFO_PAGES } from "./info-content";
import { themeMenu } from "./theme-menu";

/** Information-page links; none for mainland-China visitors (plan §4.2). */
export function infoLinks(ctx: ChromeContext, cls: string): string {
  if (ctx.restricted) return "";
  const { t } = ctx.intl;
  const link = (p: string) => `<a href="/${p}"${ctx.path === `/${p}` ? ' aria-current="page"' : ""}>${escapeHtml(t(`info.${p}.title`, { brand: GLOSSARY.brand }))}</a>`;
  return `<nav class="${cls}">${INFO_PAGES.map(link).join("")}</nav>`;
}

export function copyright(): string {
  const year = new Date().getUTCFullYear();
  return `<span>© ${year} ${GLOSSARY.brand}</span>`;
}

/** Logo + tagline. Phones keep them on one line and drop the tagline when it would wrap (CSS). */
export function footerBrand(ctx: ChromeContext, heightRem: number): string {
  return `<div class="ni-ftr-brand">${brand(ctx, heightRem)}<p class="ni-ftr-tag">${escapeHtml(ctx.intl.t("common.tagline"))}</p></div>`;
}

/**
 * Footer per approved v2 design: brand + tagline, site links, © + language + theme.
 * Phones (2026-10-27 design): language and theme are in the header, so the footer shows
 * logo + tagline, the site links edge to edge (none for mainland-China visitors), ©.
 * `narrowOnly`: feed pages show it below 75rem only — wider screens use the
 * three-column shell (shell.css), whose side columns carry the same content.
 */
export function siteFooter(ctx: ChromeContext, narrowOnly = false): string {
  return (
    `<footer class="ni-ftr${narrowOnly ? " ni-ftr-narrow" : ""}"><div class="ni-ftr-in">${footerBrand(ctx, 1.625)}${infoLinks(ctx, "ni-ftr-links")}` +
    `<div class="ni-ftr-meta">${copyright()}<span class="ni-sp"></span>${languageMenu(ctx)}${themeMenu(ctx)}</div></div></footer>`
  );
}
