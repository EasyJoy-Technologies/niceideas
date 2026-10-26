import type { Post } from "@/server/db/schema";
import { editBlocker } from "@/server/posts/edit-post";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { badgeAppName, sourceBadge } from "./sources";

/** True when the signed-in viewer wrote the post (author-only actions). */
export const isOwnPost = (ctx: ChromeContext, post: Pick<Post, "author_id">) => !!ctx.viewer && ctx.viewer.user_id === post.author_id;

/**
 * Author's "⋯" menu (no JS needed: nested <details>): Edit (while the post can be edited), Make
 * private / Make public (reversible, no confirmation), then Delete, which opens an inline confirmation with
 * the consequences; posts shared from an app say the original there is not affected.
 * `back`: same-site page to return to after deleting.
 */
/** Make private / Make public: a one-button form (src/server/share/visibility-route.ts). */
function visibilityItem(ctx: ChromeContext, post: Pick<Post, "slug" | "visibility">, back: string): string {
  const to = post.visibility === "private" ? "public" : "private";
  const label = escapeHtml(ctx.intl.t(to === "private" ? "share.action.makePrivate" : "share.action.makePublic"));
  return (
    `<li><form method="post" action="/api/web/posts/visibility"><input type="hidden" name="slug" value="${escapeHtml(post.slug)}">` +
    `<input type="hidden" name="visibility" value="${to}"><input type="hidden" name="back" value="${escapeHtml(back)}">` +
    `<button type="submit">${icon(to === "private" ? "lock" : "lockOpen")}<span>${label}</span></button></form></li>`
  );
}

export function ownPostMenu(ctx: ChromeContext, post: Pick<Post, "slug" | "source" | "status" | "media_state" | "visibility">, back: string): string {
  const { t } = ctx.intl;
  const more = escapeHtml(t("share.action.more"));
  const del = escapeHtml(t("share.action.delete"));
  const badge = sourceBadge(post.source);
  const fromApp = badge ? `<p>${escapeHtml(t("share.delete.fromApp", { app: badgeAppName(t, badge) }))}</p>` : "";
  const form =
    `<form class="ni-del-f" method="post" action="/api/web/posts/delete"><input type="hidden" name="slug" value="${escapeHtml(post.slug)}">` +
    `<input type="hidden" name="back" value="${escapeHtml(back)}"><b>${escapeHtml(t("share.delete.title"))}</b><p>${escapeHtml(t("share.delete.body"))}</p>${fromApp}` +
    `<button type="submit" class="ni-btn ni-btn-sm ni-btn-danger">${del}</button></form>`;
  return (
    `<details class="ni-menu ni-more"><summary class="ni-act ni-more-btn" aria-label="${more}" title="${more}">${icon("more")}</summary>` +
    `<ul>${editBlocker(post) ? "" : `<li><a href="/p/${escapeHtml(post.slug)}/edit">${icon("edit")}<span>${escapeHtml(t("share.action.edit"))}</span></a></li>`}` +
    `${visibilityItem(ctx, post, back)}<li><details class="ni-del"><summary>${icon("withdrawn")}<span>${del}</span></summary>${form}</details></li></ul></details>`
  );
}
