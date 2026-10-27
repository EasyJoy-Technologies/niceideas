import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { signInHref } from "./account-menu";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";

/** Home with the compose box quoting the post (phones: the compose sheet, opened by `#compose`). */
export const quoteHref = (slug: string) => `/?quote=${encodeURIComponent(slug)}#compose`;

/**
 * Repost action with the count shown (plain reposts + live quotes). Signed in: a menu (no JS needed:
 * <details> + form) with Repost / Undo repost and Quote; /scripts/interact.js sends the form in place.
 * Signed out: a link to sign in that returns here. Not shown in mainland China (no in-site sharing there)
 * nor on private posts. `back`: page to return to after a repost without JS.
 */
export function repostAction(ctx: ChromeContext, post: Pick<Post, "slug" | "visibility">, count: number, reposted: boolean, back: string): string {
  if (ctx.restricted || post.visibility !== "public") return "";
  const { t } = ctx.intl;
  const label = escapeHtml(t("share.action.repost"));
  const inner = `${icon("repost")}<span data-repost-count>${count}</span>`;
  if (!ctx.viewer) return `<a class="ni-act" href="${escapeHtml(signInHref(ctx))}" aria-label="${label}" title="${label}">${inner}</a>`;
  const slug = escapeHtml(post.slug);
  const on = escapeHtml(t("share.action.repost"));
  const off = escapeHtml(t("share.action.undoRepost"));
  const form =
    `<form method="post" action="/api/web/posts/repost" data-repost="${slug}"><input type="hidden" name="slug" value="${slug}">` +
    `<input type="hidden" name="on" value="${reposted ? "0" : "1"}"><input type="hidden" name="back" value="${escapeHtml(back)}">` +
    `<button type="submit" data-on-label="${on}" data-off-label="${off}">${icon("repost")}<span>${reposted ? off : on}</span></button></form>`;
  return (
    `<details class="ni-menu ni-rp" data-repost-menu="${slug}"${reposted ? " data-reposted" : ""}><summary class="ni-act" aria-label="${label}" title="${label}">${inner}</summary>` +
    `<ul><li>${form}</li><li><a href="${escapeHtml(quoteHref(post.slug))}">${icon("edit")}<span>${escapeHtml(t("share.action.quote"))}</span></a></li></ul></details>`
  );
}
