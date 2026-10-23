import { escapeHtml } from "@/server/render/escape";
import { brand, languageMenu, type ChromeContext } from "./chrome";
import { icon } from "./icons";
import { themeMenu } from "./theme-menu";
import { copyright, infoLinks } from "./site-footer";

/**
 * Information pages (about, guidelines, terms, privacy, help) — v4.1 design, round-5 header:
 * brand (= home link), page links, language, theme; on phones the page links move into a
 * hamburger menu (no JS: <details>) and the footer keeps only ©.
 */
export function infoHeader(ctx: ChromeContext): string {
  return (
    `<header class="ni-hdr ni-info-hdr"><div class="ni-hdr-in">${brand(ctx, 1.875, true)}<span class="ni-sp"></span>` +
    `${infoLinks(ctx, "ni-info-nav")}${languageMenu(ctx)}${themeMenu(ctx)}${pageMenu(ctx)}</div></header>`
  );
}

/** Phone hamburger with the information-page links (none for mainland-China visitors). */
function pageMenu(ctx: ChromeContext): string {
  const links = infoLinks(ctx, "ni-info-more-links");
  if (!links) return "";
  const label = escapeHtml(ctx.intl.t("info.footerMenu"));
  return `<details class="ni-menu ni-info-more"><summary aria-label="${label}" title="${label}">${icon("menu")}</summary>${links}</details>`;
}

export function infoFooter(ctx: ChromeContext): string {
  return (
    `<footer class="ni-ftr ni-info-ftr"><div class="ni-ftr-in">${brand(ctx, 1.25)}${copyright()}<span class="ni-sp"></span>` +
    `${infoLinks(ctx, "ni-ftr-links")}</div></footer>`
  );
}
