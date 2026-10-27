import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { signInHref } from "./account-menu";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";

/**
 * Bookmark action with the post's public count. Signed in: toggle button (/scripts/interact.js,
 * `aria-pressed` = saved by the viewer). Signed out: a link to sign in that returns to this page;
 * in mainland China (no sign-in pages) the count only. Who saved a post is never shown.
 */
export function bookmarkAction(ctx: ChromeContext, post: Pick<Post, "slug" | "bookmark_count">, bookmarked: boolean): string {
  const label = escapeHtml(ctx.intl.t("share.action.bookmark"));
  const inner = `${icon("star")}<span>${post.bookmark_count}</span>`;
  if (ctx.viewer) return `<button type="button" class="ni-act" data-bookmark="${post.slug}" aria-pressed="${bookmarked}" aria-label="${label}" title="${label}">${inner}</button>`;
  if (ctx.restricted) return `<span class="ni-act ni-act-static" role="img" aria-label="${label}" title="${label}">${inner}</span>`;
  return `<a class="ni-act" href="${escapeHtml(signInHref(ctx))}" aria-label="${label}" title="${label}">${inner}</a>`;
}
