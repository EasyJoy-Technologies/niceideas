import type { Post } from "@/server/db/schema";
import { editBlocker } from "@/server/posts/edit-post";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { type BadgeSource, sourceBadge } from "./sources";
import { VISIBILITIES } from "@/server/posts/visibility";
import { VISIBILITY_ICONS, visibilityLabel } from "./visibility-bits";

/** True when the signed-in viewer wrote the post (author-only actions). */
export const isOwnPost = (ctx: ChromeContext, post: Pick<Post, "author_id">) => !!ctx.viewer && ctx.viewer.user_id === post.author_id;

/**
 * "Who can see: …" (plan docs/plan/2026-11-10-audience-visibility.md §6): opens the four choices, the current one
 * ticked; each is a one-button form (src/server/share/visibility-route.ts; reversible, no confirmation).
 */
function visibilityItem(ctx: ChromeContext, post: Pick<Post, "slug" | "visibility">, back: string): string {
  const current = post.visibility;
  const options = VISIBILITIES.map((v) => {
    const label = escapeHtml(visibilityLabel(ctx, v));
    const on = v === current;
    const fields = `<input type="hidden" name="slug" value="${escapeHtml(post.slug)}"><input type="hidden" name="visibility" value="${v}"><input type="hidden" name="back" value="${escapeHtml(back)}">`;
    return `<li><form method="post" action="/api/web/posts/visibility">${fields}<button type="submit"${on ? ' aria-current="true"' : ""}>${icon(VISIBILITY_ICONS[v])}<span>${label}</span>${on ? icon("check", "ni-i ni-vis-on") : ""}</button></form></li>`;
  }).join("");
  const summary = escapeHtml(ctx.intl.t("share.visibility.menu", { value: visibilityLabel(ctx, current) }));
  return `<li><details class="ni-vis"><summary>${icon(VISIBILITY_ICONS[current])}<span>${summary}</span></summary><ul>${options}</ul></details></li>`;
}

/**
 * Author's "⋯" menu (no JS needed: nested <details>): Edit (while the post can be edited; not in mainland
 * China, where the edit page is not available), Who can see (visibilityItem), then Delete, which opens an
 * inline confirmation with the consequences; posts shared from an app say the original there is not affected.
 * `back`: same-site page to return to after deleting.
 */
export function ownPostMenu(ctx: ChromeContext, post: Pick<Post, "slug" | "status" | "media_state" | "visibility"> & BadgeSource, back: string): string {
  const { t } = ctx.intl;
  const more = escapeHtml(t("share.action.more"));
  const del = escapeHtml(t("share.action.delete"));
  const badge = sourceBadge(post, ctx.intl.locale);
  const fromApp = badge ? `<p>${escapeHtml(t("share.delete.fromApp", { app: badge.name }))}</p>` : "";
  const form =
    `<form class="ni-del-f" method="post" action="/api/web/posts/delete"><input type="hidden" name="slug" value="${escapeHtml(post.slug)}">` +
    `<input type="hidden" name="back" value="${escapeHtml(back)}"><b>${escapeHtml(t("share.delete.title"))}</b><p>${escapeHtml(t("share.delete.body"))}</p>${fromApp}` +
    `<button type="submit" class="ni-btn ni-btn-sm ni-btn-danger">${del}</button></form>`;
  return (
    `<details class="ni-menu ni-more"><summary class="ni-act ni-more-btn" aria-label="${more}" title="${more}">${icon("more")}</summary>` +
    `<ul>${ctx.restricted || editBlocker(post) ? "" : `<li><a href="/p/${escapeHtml(post.slug)}/edit">${icon("edit")}<span>${escapeHtml(t("share.action.edit"))}</span></a></li>`}` +
    `${visibilityItem(ctx, post, back)}<li><details class="ni-del"><summary>${icon("withdrawn")}<span>${del}</span></summary>${form}</details></li></ul></details>`
  );
}
