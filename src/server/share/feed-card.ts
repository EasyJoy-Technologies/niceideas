import type { Media } from "@/server/db/schema";
import { withTitleInText } from "@/server/documents/short-title";
import { blockMediaKey, withBlocks, type AnyBlock } from "@/server/documents/stored";
import { cardTitle } from "./card";
import { publicUrl } from "@/server/media/keys";
import { renderDocumentHtml } from "@/server/render/document-html";
import { escapeHtml } from "@/server/render/escape";
import { responsivePicture, zoomLink } from "@/server/render/media-html";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import type { FeedItem } from "./load-feed";
import { avatarHtml, profilePath } from "./profile-bits";
import { isOwnPost, ownPostMenu } from "./post-menu";
import { badgeAppName, sourceBadge } from "./sources";

const COVER_SIZES = "(min-width: 48rem) 37rem, 100vw";
const NO_MEDIA: ReadonlyMap<string, Media> = new Map();

function coverImage(media: Media): string {
  if (media.variants.kind !== "image") return "";
  return responsivePicture(media.variants, COVER_SIZES, 'alt="" loading="lazy"', publicUrl);
}

function articleBlock(ctx: ChromeContext, item: FeedItem): string {
  const { t } = ctx.intl;
  const { post } = item;
  const facts = [t("feed.readingTime", { minutes: item.readingMinutes })];
  if (item.images) facts.push(t("feed.images", { count: item.images }));
  if (item.audios) facts.push(t("feed.audios", { count: item.audios }));
  const cover = item.cover ? coverImage(item.cover) : "";
  // The "Article" label shares the facts line (one row less per card).
  return (
    `<a class="ni-fc-article" href="/p/${post.slug}">${cover}<div class="ni-fc-t">` +
    `<h3>${escapeHtml(cardTitle(post))}</h3>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ""}` +
    `<div class="ni-fc-rt"><span class="ni-fc-kind">${escapeHtml(t("feed.article"))}</span> · ${escapeHtml(facts.join(" · "))}</div></div></a>`
  );
}

/**
 * Short posts show in full: text / to-do, then images as thumbnails (opening the
 * image viewer) and audio players, in document order (compose v2 design).
 */
function shortBlock(item: FeedItem): string {
  const key = (b: AnyBlock) => blockMediaKey(b) ?? "";
  const text = withBlocks(withTitleInText("short", item.document), (b) => b.type === "text" || b.type === "rich" || b.type === "todo");
  const thumbs = (item.document.blocks as AnyBlock[])
    .flatMap((b) => (b.type === "image" ? [item.media.get(key(b))] : []))
    .flatMap((m) => (m && m.variants.kind === "image" ? [m.variants] : []))
    .map((v) => {
      const small = v.webp[0] ?? v.fallback;
      const thumb = `<img src="${publicUrl(small.key)}" width="${small.width}" height="${small.height}" alt="" loading="lazy" decoding="async">`;
      return zoomLink(v, thumb, publicUrl, { cropped: true });
    })
    .join("");
  const audios = withBlocks(item.document, (b) => b.type === "audio" && item.media.has(key(b)));
  const body = text.blocks.length ? renderDocumentHtml(text, NO_MEDIA, publicUrl) : "";
  const media = (thumbs ? `<div class="ni-fc-thumbs">${thumbs}</div>` : "") + (audios.blocks.length ? renderDocumentHtml(audios, item.media, publicUrl) : "");
  return `<div class="ni-body ni-fc-text">${body}${media}</div>`;
}

/**
 * Timeline / profile card (approved v2 design): author row (avatar, name / @handle · time,
 * source badge at its end), body, like / comment / share.
 */
export function feedCard(ctx: ChromeContext, item: FeedItem): string {
  const { t } = ctx.intl;
  const { post } = item;
  const name = post.author_name || `@${post.author_handle}`;
  const href = profilePath(post.author_handle);
  const at = post.published_at;
  const badge = sourceBadge(post.source);
  // Phones show the app icon only (label in title / aria-label); wider screens add the text.
  const from = badge ? escapeHtml(t("share.post.from", { app: badgeAppName(t, badge) })) : "";
  const source = badge
    ? badge.href
      ? `<a class="ni-fc-src" href="${escapeHtml(badge.href)}" target="_blank" rel="noopener" title="${from}" aria-label="${from}"><img src="${escapeHtml(badge.icon)}" width="14" height="14" alt=""><span>${from}</span></a>`
      : `<span class="ni-fc-src" title="${from}" aria-label="${from}"><img src="${escapeHtml(badge.icon)}" width="14" height="14" alt=""><span>${from}</span></span>`
    : "";
  const head =
    `<div class="ni-fc-head"><a href="${href}" tabindex="-1" aria-hidden="true">${avatarHtml(name, post.author_avatar, 42)}</a><div class="ni-who">` +
    `<a class="ni-name" href="${href}">${escapeHtml(name)}</a><span class="ni-meta"><span class="ni-handle">@${escapeHtml(post.author_handle)}</span><i class="ni-dot"></i>` +
    `<a href="/p/${post.slug}"><time datetime="${at.toISOString()}" data-rel>${escapeHtml(ctx.intl.format.dateTime(at, { dateStyle: "medium" }))}</time></a></span></div>${source}</div>`;
  const body = post.kind === "short" ? shortBlock(item) : articleBlock(ctx, item);
  const actions =
    `<div class="ni-actions ni-fc-actions"><button type="button" class="ni-act" data-like="post" data-id="${post.slug}" aria-pressed="${item.liked}" aria-label="${escapeHtml(t("share.action.like"))}">` +
    `${icon("heart")}<span>${post.like_count}</span></button>` +
    `<a class="ni-act" href="/p/${post.slug}#comments" aria-label="${escapeHtml(t("share.comments.title"))}">${icon("comment")}<span>${post.comment_count}</span></a>` +
    `<button type="button" class="ni-act ni-share" data-url="/p/${post.slug}" hidden>${icon("share")}${escapeHtml(t("share.action.share"))}</button>` +
    `${isOwnPost(ctx, post) ? `<span class="ni-sp"></span>${ownPostMenu(ctx, post, ctx.path)}` : ""}</div>`;
  return `<article class="ni-card ni-fc">${head}${body}${actions}</article>`;
}
