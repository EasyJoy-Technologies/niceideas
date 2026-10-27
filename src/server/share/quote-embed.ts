import { publicUrl } from "@/server/media/keys";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import type { QuotedPost } from "./load-quotes";
import { avatarHtml } from "./profile-bits";

/** Small cover thumbnail (smallest stored rendition) of a quoted post. */
function thumb(q: QuotedPost): string {
  const v = q.cover?.variants;
  if (!v || v.kind !== "image") return "";
  const small = v.webp[0] ?? v.fallback;
  return `<img class="ni-qe-th" src="${escapeHtml(publicUrl(small.key))}" width="${small.width ?? 120}" height="${small.height ?? 120}" alt="" loading="lazy" decoding="async">`;
}

/**
 * The quoted post inside a quote (approved 2026-10-27 design): author line, then the short post's text
 * (3 lines) or the article's label, title and summary, cover thumbnail at the side; the whole box links
 * to it. `null`: the quoted post is no longer available to everyone (private, offline, removed, purged).
 * `link`: false in the compose box (the box is not a link there).
 */
export function quoteEmbed(ctx: ChromeContext, q: QuotedPost | null, link = true): string {
  const { t, format } = ctx.intl;
  if (!q) return `<div class="ni-qe ni-qe-gone">${icon("restricted")}<span>${escapeHtml(t("share.quote.unavailable"))}</span></div>`;
  const name = q.author_name || `@${q.author_handle}`;
  const head =
    `<div class="ni-qe-h">${avatarHtml(name, q.author_avatar, 20)}<b>${escapeHtml(name)}</b>` +
    `<span>@${escapeHtml(q.author_handle)} · <time datetime="${q.published_at.toISOString()}" data-rel>${escapeHtml(format.dateTime(q.published_at, { dateStyle: "medium" }))}</time></span></div>`;
  const text =
    q.kind === "article"
      ? `<div class="ni-qe-t"><span class="ni-fc-kind">${escapeHtml(t("feed.article"))}</span><h4>${escapeHtml(q.title)}</h4>${q.summary ? `<p>${escapeHtml(q.summary)}</p>` : ""}</div>`
      : `<div class="ni-qe-t">${q.summary ? `<p class="ni-qe-short">${escapeHtml(q.summary)}</p>` : ""}</div>`;
  const body = `${head}<div class="ni-qe-b">${text}${thumb(q)}</div>`;
  return link ? `<a class="ni-qe" href="/p/${escapeHtml(q.slug)}">${body}</a>` : `<div class="ni-qe">${body}</div>`;
}
