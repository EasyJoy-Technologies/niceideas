import { escapeHtml } from "@/server/render/escape";
import { brand, languageMenu, type ChromeContext } from "./chrome";
import { copyright, infoLinks } from "./site-footer";

/**
 * Information pages (about, guidelines, terms, privacy, help) — v4.1 design: a light
 * header (brand = home link, page links, language) and a one-line footer pinned to the
 * bottom; on phones the footer links collapse into a pop-up menu (no JS: <details>).
 */
export function infoHeader(ctx: ChromeContext): string {
  return (
    `<header class="ni-hdr ni-info-hdr"><div class="ni-hdr-in">${brand(ctx, 1.875, true)}<span class="ni-sp"></span>` +
    `${infoLinks(ctx, "ni-info-nav")}${languageMenu(ctx)}</div></header>`
  );
}

/** Phone footer: the information-page links in a pop-up menu (none for mainland-China visitors). */
function footerMenu(ctx: ChromeContext): string {
  const links = infoLinks(ctx, "ni-info-more-links");
  if (!links) return "";
  return `<details class="ni-menu ni-info-more"><summary>${escapeHtml(ctx.intl.t("info.footerMenu"))}</summary>${links}</details>`;
}

export function infoFooter(ctx: ChromeContext): string {
  return (
    `<footer class="ni-ftr ni-info-ftr"><div class="ni-ftr-in">${brand(ctx, 1.25)}${copyright()}<span class="ni-sp"></span>` +
    `${infoLinks(ctx, "ni-ftr-links")}${footerMenu(ctx)}</div></footer>`
  );
}
