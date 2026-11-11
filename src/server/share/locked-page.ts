import type { Profile } from "@/server/db/schema";
import type { Audience } from "@/server/posts/visibility";
import { escapeHtml } from "@/server/render/escape";
import { signInHref } from "./account-menu";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { followButton } from "./follow-button";
import { icon } from "./icons";
import { avatarHtml, profilePath } from "./profile-bits";
import { VISIBILITY_ICONS } from "./visibility-bits";

/**
 * Followers-only / friends-only post opened by someone outside its audience (plan
 * docs/plan/2026-11-10-audience-visibility.md §2, Xianglin's choice B): the author and what it takes to see
 * the post — sign in, follow, or (friends only) wait to be followed back. No content, card or comments;
 * never indexed. Mainland China (no sign-in or following there): the text only.
 */
export function renderLockedPage(ctx: ChromeContext, author: Profile, audience: Audience, following: boolean): string {
  const { t } = ctx.intl;
  const name = author.display_name || `@${author.handle}`;
  const title = t(`share.locked.${audience}.title`);
  const waiting = audience === "friends" && following;
  const body = waiting ? t("share.locked.friendsWaiting", { name }) : t(`share.locked.${audience}.body`, { name });
  let action = "";
  if (!ctx.restricted) {
    if (!ctx.viewer) {
      action = `<p>${escapeHtml(t("share.locked.signedOut"))}</p><a class="ni-btn ni-btn-primary" href="${escapeHtml(signInHref(ctx))}">${escapeHtml(t("auth.signIn"))}</a>`;
    } else if (!following) {
      action = followButton(ctx, author.handle, false);
    }
  }
  const who =
    `<a class="ni-locked-who" href="${profilePath(author.handle)}">${avatarHtml(name, author.avatar_url, 40)}` +
    `<span><b>${escapeHtml(name)}</b><span>@${escapeHtml(author.handle)}</span></span></a>`;
  const main =
    `<main class="ni-status"><div class="ni-status-card ni-locked"><div class="ni-status-icon">${icon(VISIBILITY_ICONS[audience])}</div>` +
    `<h1>${escapeHtml(title)}</h1>${ctx.restricted ? "" : who}<p>${escapeHtml(body)}</p>${action ? `<div class="ni-locked-act">${action}</div>` : ""}</div></main>`;
  return renderPage(ctx, { title, head: '<meta name="robots" content="noindex">', main });
}
