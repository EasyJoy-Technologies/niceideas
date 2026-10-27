import { GLOSSARY } from "@/i18n/glossary";
import { isAdmin } from "@/server/admin/admins";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { avatarHtml, profilePath } from "./profile-bits";

/** Sign-in link that returns to the current page. */
export const signInHref = (ctx: ChromeContext) => `/auth/sign-in?next=${encodeURIComponent(ctx.path)}`;

function menuItems(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const v = ctx.viewer!;
  return (
    `<ul><li><a href="${profilePath(v.handle)}">${icon("person")}<span>${escapeHtml(t("auth.myProfile"))}</span></a></li>` +
    `<li><a href="/bookmarks">${icon("star")}<span>${escapeHtml(t("bookmarks.title"))}</span></a></li>` +
    `<li><a href="/settings">${icon("settings")}<span>${escapeHtml(t("settings.title"))}</span></a></li>` +
    (isAdmin(v) ? `<li><a href="/admin">${icon("restricted")}<span>${escapeHtml(t("admin.title"))}</span></a></li>` : "") +
    `<li><form method="post" action="/auth/sign-out"><button type="submit">${icon("signOut")}<span>${escapeHtml(t("auth.signOut"))}</span></button></form></li></ul>`
  );
}

/**
 * Account control. `rail`: avatar, name, @handle and "…" (wide-screen left column,
 * menu opens upwards); `header`: avatar only (narrow screens). No JS: <details>.
 */
export function accountMenu(ctx: ChromeContext, variant: "rail" | "header"): string {
  const v = ctx.viewer;
  if (!v || ctx.restricted) return "";
  const name = v.display_name || `@${v.handle}`;
  const label = escapeHtml(ctx.intl.t("auth.accountMenu"));
  const summary =
    variant === "rail"
      ? `${avatarHtml(name, v.avatar_url, 40)}<span class="ni-who"><span class="ni-name">${escapeHtml(name)}</span><span class="ni-meta">@${escapeHtml(v.handle)}</span></span>${icon("more")}`
      : avatarHtml(name, v.avatar_url, 32);
  return `<details class="ni-menu ni-acct ni-acct-${variant}"><summary aria-label="${label}">${summary}</summary>${menuItems(ctx)}</details>`;
}

/** Signed-out prompt of the wide-screen left column. */
export function signInCard(ctx: ChromeContext): string {
  if (ctx.viewer || ctx.restricted) return "";
  const { t } = ctx.intl;
  return (
    `<section class="ni-card ni-signin"><p>${escapeHtml(t("auth.prompt"))}</p>` +
    `<a class="ni-btn ni-btn-primary" href="${escapeHtml(signInHref(ctx))}">${escapeHtml(t("auth.signIn"))}</a></section>`
  );
}

/** Narrow-screen header action: account avatar, or "Join NiceIdeas" (→ sign-in). */
export function headerAccount(ctx: ChromeContext): string {
  if (ctx.restricted) return "";
  if (ctx.viewer) return accountMenu(ctx, "header");
  const { t } = ctx.intl;
  const long = t("share.header.join", { brand: GLOSSARY.brand });
  // Phones get the short label (CSS swaps them); the long one stays the accessible name.
  return (
    `<a class="ni-btn ni-btn-primary" href="${escapeHtml(signInHref(ctx))}" aria-label="${escapeHtml(long)}"><span class="ni-wide">${escapeHtml(long)}</span>` +
    `<span class="ni-narrow" aria-hidden="true">${escapeHtml(t("share.header.joinShort"))}</span></a>`
  );
}
