import type { Media } from "@/server/db/schema";
import { cardTitle } from "./card";
import { publicUrl } from "@/server/media/keys";
import { renderDocumentHtml } from "@/server/render/document-html";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import type { FeedItem } from "./load-feed";
import { avatarHtml, profilePath } from "./profile-bits";
import { sourceBadge } from "./sources";

const COVER_SIZES = "(min-width: 48rem) 37rem, 100vw";
const NO_MEDIA: ReadonlyMap<string, Media> = new Map();

function coverImage(media: Media): string {
  if (media.variants.kind !== "image") return "";
  const v = media.variants;
  const srcset = v.webp.map((r) => `${publicUrl(r.key)} ${r.width}w`).join(", ");
  return (
    `<picture><source type="image/webp" srcset="${srcset}" sizes="${COVER_SIZES}">` +
    `<img src="${publicUrl(v.fallback.key)}" width="${v.fallback.width}" height="${v.fallback.height}" alt="" loading="lazy" decoding="async"></picture>`
  );
}

function articleBlock(ctx: ChromeContext, item: FeedItem): string {
  const { t } = ctx.intl;
  const { post } = item;
  const facts = [t("feed.readingTime", { minutes: item.readingMinutes })];
  if (item.images) facts.push(t("feed.images", { count: item.images }));
  if (item.audios) facts.push(t("feed.audios", { count: item.audios }));
  const cover = item.cover ? coverImage(item.cover) : "";
  return (
    `<a class="ni-fc-article" href="/p/${post.slug}">${cover}<div class="ni-fc-t"><div class="ni-fc-kind">${escapeHtml(t("feed.article"))}</div>` +
    `<h3>${escapeHtml(cardTitle(post))}</h3>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ""}` +
    `<div class="ni-fc-rt">${escapeHtml(facts.join(" · "))}</div></div></a>`
  );
}

/** Short posts show in full (text and to-do blocks only; they never carry media). */
function shortBlock(item: FeedItem): string {
  const doc = { ...item.document, blocks: item.document.blocks.filter((b) => b.type === "text" || b.type === "todo") };
  return `<div class="ni-body ni-fc-text">${renderDocumentHtml(doc, NO_MEDIA, publicUrl)}</div>`;
}

/** Timeline / profile card (approved v2 design): author, body, source badge, like / comment / share. */
export function feedCard(ctx: ChromeContext, item: FeedItem): string {
  const { t } = ctx.intl;
  const { post } = item;
  const name = post.author_name || `@${post.author_handle}`;
  const href = profilePath(post.author_handle);
  const at = post.published_at;
  const head =
    `<div class="ni-fc-head"><a href="${href}" tabindex="-1">${avatarHtml(name, post.author_avatar, 40)}</a><div class="ni-who">` +
    `<a class="ni-name" href="${href}">${escapeHtml(name)}</a> <span class="ni-meta">@${escapeHtml(post.author_handle)}<i class="ni-dot"></i>` +
    `<a href="/p/${post.slug}"><time datetime="${at.toISOString()}" data-rel>${escapeHtml(ctx.intl.format.dateTime(at, { dateStyle: "medium" }))}</time></a></span></div></div>`;
  const body = post.kind === "short" && !item.cover ? shortBlock(item) : articleBlock(ctx, item);
  const badge = sourceBadge(post.source);
  const source = badge
    ? `<div class="ni-fc-src"><a href="${escapeHtml(badge.href)}" target="_blank" rel="noopener"><img src="${badge.icon}" width="14" height="14" alt="">${escapeHtml(t("share.post.from", { app: t(`common.${badge.nameKey}`) }))}</a></div>`
    : "";
  const actions =
    `<div class="ni-actions ni-fc-actions"><button type="button" class="ni-act" data-like="post" data-id="${post.slug}" aria-pressed="${item.liked}" aria-label="${escapeHtml(t("share.action.like"))}">` +
    `${icon("heart")}<span>${post.like_count}</span></button>` +
    `<a class="ni-act" href="/p/${post.slug}#comments" aria-label="${escapeHtml(t("share.comments.title"))}">${icon("comment")}<span>${post.comment_count}</span></a>` +
    `<button type="button" class="ni-act ni-share" data-url="/p/${post.slug}" hidden>${icon("share")}${escapeHtml(t("share.action.share"))}</button></div>`;
  return `<article class="ni-card ni-fc">${head}${body}${source}${actions}</article>`;
}
