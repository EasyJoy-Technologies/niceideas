import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon, type IconName } from "./icons";
import { profilePath } from "./profile-bits";
import { unreadBadge } from "./site-columns";
import { signInHref } from "./account-menu";

/**
 * Phone bottom tab bar (approved v2 design). Signed in: home, discover, "+" (opens the
 * compose sheet on home: `/#compose`, no JS needed), notifications, profile. Signed out:
 * discover and sign-in only — signed-out visitors cannot post. Never for mainland-China visitors.
 */
export function phoneTabBar(ctx: ChromeContext): string {
  if (ctx.restricted) return "";
  const { t } = ctx.intl;
  const tab = (href: string, ico: IconName, key: string, on: boolean, extra = "") =>
    `<a href="${escapeHtml(href)}"${on ? ' aria-current="page"' : ""}>${icon(ico)}<span class="ni-tab-l">${escapeHtml(t(key))}</span>${extra}</a>`;
  const v = ctx.viewer;
  if (!v) {
    return `<nav class="ni-tabbar ni-tabbar-2">${tab("/discover", "compass", "discover.title", ctx.path === "/discover" || ctx.path === "/")}${tab(signInHref(ctx), "signIn", "nav.signIn", false)}</nav>`;
  }
  const plus = `<a class="ni-tab-plus" href="/#compose" aria-label="${escapeHtml(t("nav.compose"))}"><span>${icon("plus")}</span></a>`;
  return (
    `<nav class="ni-tabbar">${tab("/", "home", "nav.home", ctx.path === "/")}${tab("/discover", "compass", "discover.title", ctx.path === "/discover")}${plus}` +
    `${tab("/notifications", "bell", "notifications.title", ctx.path === "/notifications", unreadBadge(ctx))}${tab(profilePath(v.handle), "person", "nav.me", ctx.path === profilePath(v.handle))}</nav>`
  );
}
