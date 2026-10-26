import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { isOwnPost, ownPostMenu } from "./post-menu";

/**
 * Like / comment / share actions under a post, then "⋯": the author's menu (delete) or, for
 * others, report; plus the fixed bottom bar on phones (approved v2 design). Interactive with /scripts/interact.js.
 * Private posts (seen by their author only) take no likes and are not shared: comments link and menu only.
 */
export function postActions(ctx: ChromeContext, post: Post, liked: boolean): string {
  const { t } = ctx.intl;
  const like = (cls: string) =>
    `<button type="button" class="ni-act ${cls}" data-like="post" data-id="${post.slug}" aria-pressed="${liked}" aria-label="${escapeHtml(t("share.action.like"))}">` +
    `${icon("heart")}<span>${post.like_count}</span></button>`;
  const comment = `<a class="ni-act" href="#comments" aria-label="${escapeHtml(t("share.comments.title"))}">${icon("comment")}<span>${post.comment_count}</span></a>`;
  const share = `<button type="button" class="ni-act ni-share" hidden>${icon("share")}${escapeHtml(t("share.action.share"))}</button>`;
  const report = isOwnPost(ctx, post)
    ? ownPostMenu(ctx, post, `/p/${post.slug}`)
    : `<button type="button" class="ni-act" data-report="" aria-label="${escapeHtml(t("share.action.report"))}">${icon("more")}</button>`;
  if (post.visibility === "private") return `<div class="ni-actions">${comment}<span class="ni-sp"></span>${report}</div>`;
  return (
    `<div class="ni-actions">${like("")}${comment}${share}<span class="ni-sp"></span>${report}</div>` +
    `<nav class="ni-mbar">${like("")}${comment}${share}</nav>`
  );
}
