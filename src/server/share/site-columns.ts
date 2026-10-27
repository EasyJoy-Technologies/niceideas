import { languageMenu, brand, type ChromeContext } from "./chrome";
import { accountMenu, signInCard } from "./account-menu";
import { escapeHtml } from "@/server/render/escape";
import { icon, type IconName } from "./icons";
import { profilePath } from "./profile-bits";
import { themeMenu } from "./theme-menu";
import { copyright, infoLinks } from "./site-footer";

/** Red unread count ("99+" when large); empty when none. */
export function unreadBadge(ctx: ChromeContext): string {
  const n = ctx.unread ?? 0;
  return n > 0 ? `<span class="ni-badge" aria-label="${escapeHtml(ctx.intl.t("notifications.unread", { count: n }))}">${n > 99 ? "99+" : n}</span>` : "";
}

/**
 * Left column of the wide-screen shell (v3 design): brand, navigation; at the
 * bottom the account row (signed in) or the sign-in card (signed out).
 * Mainland-China visitors never reach these pages (451), so no restricted variant.
 */
export function siteRail(ctx: ChromeContext): string {
  const item = (href: string, ico: IconName, key: string, on: boolean, extra = "") =>
    `<a class="ni-rail-nav" href="${href}"${on ? ' aria-current="page"' : ""}>${icon(ico)}<span>${escapeHtml(ctx.intl.t(key))}</span>${extra}</a>`;
  const signedIn = !!ctx.viewer;
  const nav = ctx.restricted
    ? ""
    : (signedIn ? item("/", "home", "nav.home", ctx.path === "/") : "") +
      item("/discover", "compass", "discover.title", ctx.path === "/discover" || (!signedIn && ctx.path === "/")) +
      (signedIn ? item("/notifications", "bell", "notifications.title", ctx.path === "/notifications", unreadBadge(ctx)) : "") +
      (signedIn ? item("/bookmarks", "bookmark", "bookmarks.title", ctx.path === "/bookmarks") : "") +
      (signedIn ? item(profilePath(ctx.viewer!.handle), "person", "auth.myProfile", ctx.path === profilePath(ctx.viewer!.handle)) : "") +
      (signedIn ? item("/settings", "settings", "settings.title", ctx.path === "/settings") : "");
  const bottom = ctx.viewer ? accountMenu(ctx, "rail") : signInCard(ctx);
  return `<nav class="ni-rail">${brand(ctx, 1.75)}${nav}<div class="ni-col-foot">${bottom}</div></nav>`;
}

/** Right column (v3 design): discovery panels on top; site links, language, theme and © pinned to the bottom. */
export function siteAside(ctx: ChromeContext, panels = ""): string {
  return (
    `<aside class="ni-aside">${panels}<div class="ni-col-foot">${infoLinks(ctx, "ni-aside-links")}` +
    `<div class="ni-aside-meta">${languageMenu(ctx)}${themeMenu(ctx)}<span class="ni-sp"></span>${copyright()}</div></div></aside>`
  );
}
