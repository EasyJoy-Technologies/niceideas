import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { bookmarkAction } from "./bookmark-button";
import { icon } from "./icons";
import { isOwnPost, ownPostMenu } from "./post-menu";
import { repostAction } from "./repost-button";

/**
 * Like / comment / repost / bookmark / share actions under a post, then "⋯": the author's menu (delete) or, for
 * others, report. Phones show the same row, "⋯" included, as the fixed bottom bar instead (interact.css; Xianglin
 * 2026-10-28). Interactive with /scripts/interact.js.
 * Private posts (seen by their author only): the author's own like and comments, no reposts, bookmarks or sharing.
 */
export function postActions(ctx: ChromeContext, post: Post, state: { liked: boolean; bookmarked: boolean; reposted: boolean; repostCount: number }): string {
  const { liked, bookmarked } = state;
  const { t } = ctx.intl;
  const like = (cls: string) =>
    `<button type="button" class="ni-act ${cls}" data-like="post" data-id="${post.slug}" aria-pressed="${liked}" aria-label="${escapeHtml(t("share.action.like"))}">` +
    `${icon("heart")}<span>${post.like_count}</span></button>`;
  const comment = `<a class="ni-act" href="#comments" aria-label="${escapeHtml(t("share.comments.title"))}">${icon("comment")}<span>${post.comment_count}</span></a>`;
  const shareLabel = escapeHtml(t("share.action.share"));
  // Icon only in the phone bar (room for "⋯"): the label stays as its accessible name.
  const share = `<button type="button" class="ni-act ni-share" aria-label="${shareLabel}" title="${shareLabel}" hidden>${icon("share")}<span class="ni-share-t">${shareLabel}</span></button>`;
  const report = isOwnPost(ctx, post)
    ? ownPostMenu(ctx, post, `/p/${post.slug}`)
    : `<button type="button" class="ni-act" data-report="" aria-label="${escapeHtml(t("share.action.report"))}">${icon("more")}</button>`;
  const row = (acts: string) => `<div class="ni-actions">${acts}<span class="ni-sp"></span>${report}</div><nav class="ni-mbar">${acts}${report}</nav>`;
  if (post.visibility === "private") return row(like("") + comment);
  const bookmark = bookmarkAction(ctx, post, bookmarked);
  const repost = repostAction(ctx, post, state.repostCount, state.reposted, `/p/${post.slug}`);
  return row(`${like("")}${comment}${repost}${bookmark}${share}`);
}
