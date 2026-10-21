import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import { brand, languageMenu, type ChromeContext } from "./chrome";
import { icon } from "./icons";
import { copyright, infoLinks } from "./site-footer";

/**
 * Left rail of the wide-screen app shell (approved v2 design, signed-out view):
 * brand, navigation, language. Signed-in items (home, notifications, my profile,
 * settings, post) join once web sign-in ships. Mainland-China visitors: no navigation.
 */
export function siteRail(ctx: ChromeContext): string {
  const label = escapeHtml(ctx.intl.t("discover.title"));
  const current = ctx.path === "/discover" || ctx.path === "/" ? ' aria-current="page"' : "";
  const nav = ctx.restricted ? "" : `<a class="ni-rail-nav" href="/discover"${current}>${icon("compass")}<span>${label}</span></a>`;
  return `<nav class="ni-rail">${brand(ctx, 1.75)}${nav}<div class="ni-rail-foot">${languageMenu(ctx)}</div></nav>`;
}

/** Right column: join card (tagline + join), site links, © · version. */
export function siteAside(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const join = ctx.restricted
    ? ""
    : `<a class="ni-btn ni-btn-primary" href="/">${escapeHtml(t("share.header.join", { brand: GLOSSARY.brand }))}</a>`;
  return (
    `<aside class="ni-aside"><section class="ni-card ni-aside-card"><h2>${escapeHtml(t("common.tagline"))}</h2>${join}</section>` +
    `${infoLinks(ctx, "ni-aside-links")}${copyright(ctx)}</aside>`
  );
}
