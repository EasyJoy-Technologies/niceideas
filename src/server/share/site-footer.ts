import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import { APP_VERSION } from "@/server/version";
import { brand, languageMenu, type ChromeContext } from "./chrome";
import { INFO_PAGES } from "./info-content";

/** Information-page links; none for mainland-China visitors (plan §4.2). */
export function infoLinks(ctx: ChromeContext, cls: string): string {
  if (ctx.restricted) return "";
  const { t } = ctx.intl;
  return `<nav class="${cls}">${INFO_PAGES.map((p) => `<a href="/${p}">${escapeHtml(t(`info.${p}.title`, { brand: GLOSSARY.brand }))}</a>`).join("")}</nav>`;
}

export function copyright(ctx: ChromeContext): string {
  const year = new Date().getUTCFullYear();
  return `<span>© ${year} ${GLOSSARY.brand} · ${escapeHtml(ctx.intl.t("common.footer.version", { version: APP_VERSION }))}</span>`;
}

/**
 * Footer per approved v2 design: brand + tagline, site links, © · version + language.
 * `narrowOnly`: feed pages show it below 75rem only — wider screens use the
 * three-column shell (shell.css), whose side columns carry the same content.
 */
export function siteFooter(ctx: ChromeContext, narrowOnly = false): string {
  const { t } = ctx.intl;
  return (
    `<footer class="ni-ftr${narrowOnly ? " ni-ftr-narrow" : ""}"><div class="ni-ftr-in"><div class="ni-ftr-brand">${brand(ctx, 1.625)}` +
    `<p>${escapeHtml(t("common.tagline"))}</p></div>${infoLinks(ctx, "ni-ftr-links")}` +
    `<div class="ni-ftr-meta">${copyright(ctx)}${languageMenu(ctx)}</div></div></footer>`
  );
}
