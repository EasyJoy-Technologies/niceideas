import type { CommentRow } from "@/server/db/repos/comments";
import type { Post } from "@/server/db/schema";
import { COMMENT_MAX_CHARS, NAME_MAX_CHARS } from "@/server/interactions/comments";
import { REPORT_REASONS } from "@/server/interactions/reports";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { avatarHtml, profilePath } from "./profile-bits";
import type { CommentThread, PageInteractions } from "./load-interactions";

const ago = (ctx: ChromeContext, at: Date) =>
  `<time datetime="${at.toISOString()}" data-rel>${escapeHtml(ctx.intl.format.dateTime(at, { dateStyle: "medium" }))}</time>`;

/** Comment text is plain: escaped, line breaks kept, links not clickable (anti-spam). */
/** Comment text: escaped, line breaks kept (also the profile "Replies" cards). */
export const commentBody = (text: string) => `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;

function commentItem(ctx: ChromeContext, post: Post, c: CommentRow, liked: boolean, replies = ""): string {
  const { t } = ctx.intl;
  const anonymous = c.author_id === null;
  const name = anonymous ? c.anon_name || t("share.comments.anonymous") : c.author_name || `@${c.author_handle ?? ""}`;
  const tag = anonymous
    ? `<span class="ni-tag">${escapeHtml(t("share.comments.anonTag"))}</span>`
    : c.author_id === post.author_id
      ? `<span class="ni-tag ni-tag-author">${escapeHtml(t("share.comments.authorTag"))}</span>`
      : "";
  // Account comments: the profile's avatar (or its initial) and a link to the profile (no in-site links in mainland China).
  const avatar = anonymous
    ? `<span class="ni-cmt-ava" aria-hidden="true">${icon("person")}</span>`
    : avatarHtml(name, c.author_avatar, 36, "ni-avatar ni-cmt-ava");
  const profile = !anonymous && c.author_handle && !ctx.restricted ? profilePath(c.author_handle) : null;
  const nameHtml = profile ? `<a class="ni-name" href="${profile}">${escapeHtml(name)}</a>` : `<span class="ni-name">${escapeHtml(name)}</span>`;
  // Private posts (their author only): like and reply, nothing to report.
  const report = post.visibility === "private" ? "" : `<span class="ni-sp"></span><button type="button" class="ni-act" data-report="${c.id}" aria-label="${escapeHtml(t("share.action.report"))}">${icon("more")}</button>`;
  const actions =
    `<div class="ni-cmt-actions"><button type="button" class="ni-act" data-like="comment" data-id="${c.id}" aria-pressed="${liked}" aria-label="${escapeHtml(t("share.action.like"))}">` +
    `${icon("heart")}<span>${c.like_count || ""}</span></button>` +
    (c.parent_id ? "" : `<button type="button" class="ni-act" data-reply="${c.id}" data-name="${escapeHtml(name)}">${icon("comment")}${escapeHtml(t("share.action.reply"))}</button>`) +
    `${report}</div>`;
  return (
    `<div class="ni-cmt" id="c-${c.id}">${avatar}<div class="ni-cmt-main"><div class="ni-cmt-top">${nameHtml}${tag}` +
    `<span class="ni-meta">${ago(ctx, c.created_at)}</span></div>${commentBody(c.body)}${actions}${replies}</div></div>`
  );
}

function thread(ctx: ChromeContext, post: Post, th: CommentThread, data: PageInteractions): string {
  const replies = th.replies.map((r) => commentItem(ctx, post, r, data.likedComments.has(r.id))).join("");
  return commentItem(ctx, post, th.comment, data.likedComments.has(th.comment.id), replies ? `<div class="ni-replies">${replies}</div>` : "");
}

/**
 * Comment form. Signed in: the comment is the account's (its name and avatar; `data-account` tells
 * /scripts/interact.js to skip the anonymous proof of work). Signed out: anonymous with an optional
 * nickname, unless the post takes comments from signed-in users only.
 */
function composer(ctx: ChromeContext, post: Post): string {
  const { t } = ctx.intl;
  const v = ctx.viewer;
  if (post.comments_mode === "closed" || (post.comments_mode === "signed_in" && !v)) {
    const key = post.comments_mode === "closed" ? "share.comments.closed" : "share.comments.signedInOnly";
    return `<p class="ni-note">${escapeHtml(t(key))}</p>`;
  }
  const who = v
    ? `<span class="ni-hint">${escapeHtml(t("share.comments.asUser", { name: v.display_name || `@${v.handle}` }))}</span>`
    : `<input name="name" maxlength="${NAME_MAX_CHARS}" autocomplete="nickname" placeholder="${escapeHtml(t("share.comments.name"))}" aria-label="${escapeHtml(t("share.comments.name"))}">` +
      `<span class="ni-hint">${escapeHtml(t("share.comments.anonHint"))}</span>`;
  return (
    `<form class="ni-composer" data-slug="${post.slug}"${v ? ' data-account=""' : ""} novalidate>` +
    `<div class="ni-reply-to" hidden><span></span><button type="button" class="ni-link">${escapeHtml(t("share.action.cancel"))}</button></div>` +
    `<textarea name="body" rows="3" maxlength="${COMMENT_MAX_CHARS}" required placeholder="${escapeHtml(t("share.comments.placeholder"))}" aria-label="${escapeHtml(t("share.comments.placeholder"))}"></textarea>` +
    `<div class="ni-composer-row">${who}` +
    `<button type="submit" class="ni-btn ni-btn-primary ni-btn-sm">${escapeHtml(t("share.comments.submit"))}</button></div>` +
    `<p class="ni-form-error" role="alert" hidden></p></form>`
  );
}

/** Report dialog (opened by /scripts/interact.js for the post or a comment). */
export function reportDialog(ctx: ChromeContext, slug: string): string {
  const { t } = ctx.intl;
  const reasons = REPORT_REASONS.map(
    (r, i) => `<label><input type="radio" name="reason" value="${r}"${i === 0 ? " checked" : ""}>${escapeHtml(t(`share.report.reason.${r}`))}</label>`,
  ).join("");
  return (
    `<dialog class="ni-dialog" id="ni-report" data-slug="${slug}"><form method="dialog"><h2>${escapeHtml(t("share.action.report"))}</h2>` +
    `<div class="ni-reasons">${reasons}</div><div class="ni-dialog-row"><button type="button" class="ni-btn ni-btn-ghost" value="cancel">${escapeHtml(t("share.action.cancel"))}</button>` +
    `<button type="submit" class="ni-btn ni-btn-primary">${escapeHtml(t("share.report.submit"))}</button></div></form></dialog>`
  );
}

/** Comments card (plan §16.2): anonymous composer, threads with one reply level, paging. */
export function commentsSection(ctx: ChromeContext, post: Post, data: PageInteractions, path: string): string {
  const { t } = ctx.intl;
  const list = data.threads.length
    ? data.threads.map((th) => thread(ctx, post, th, data)).join("")
    : data.page === 1 ? `<p class="ni-note">${escapeHtml(t("share.comments.empty"))}</p>` : "";
  const more = data.hasMore ? `<a class="ni-cmt-more" href="${escapeHtml(`${path}?cpage=${data.page + 1}#comments`)}">${escapeHtml(t("share.comments.more"))}</a>` : "";
  return (
    `<section class="ni-card ni-comments" id="comments"><h2>${escapeHtml(t("share.comments.title"))} <span>${post.comment_count}</span></h2>` +
    `${composer(ctx, post)}<div class="ni-cmt-list">${list}</div>${more}</section>`
  );
}
