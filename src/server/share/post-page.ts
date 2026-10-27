import { GLOSSARY } from "@/i18n/glossary";
import { withTitleInText } from "@/server/documents/short-title";
import { mediaUrlFor } from "@/server/posts/media-url";
import { postUrl } from "@/server/posts/post-dto";
import { renderDocumentHtml } from "@/server/render/document-html";
import { escapeHtml } from "@/server/render/escape";
import { shareCard } from "./card";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { followButton } from "./follow-button";
import { icon } from "./icons";
import type { SharePost } from "./load-post";
import type { Post, Profile } from "@/server/db/schema";
import { commentsSection, reportDialog } from "./comments-section";
import type { PageInteractions } from "./load-interactions";
import type { PostAside } from "./load-post-aside";
import { postActions } from "./post-actions";
import { renderPostAside } from "./post-aside";
import { directionOf } from "@/i18n/locales";
import { avatarHtml } from "./profile-bits";
import { badgeAppName, sourceBadge } from "./sources";

const meta = (property: string, content: string, attr = "property") => `<meta ${attr}="${property}" content="${escapeHtml(content)}">`;

/** Share-card tags read by Facebook, X, LinkedIn, Telegram, WhatsApp, WeChat, QQ, Weibo … (plan §16.3). */
function cardHead(ctx: ChromeContext, data: SharePost, url: string): string {
  const card = shareCard(data.post);
  const desc = card.description || ctx.intl.t("common.tagline");
  return [
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    meta("description", desc, "name"),
    meta("og:type", "article"),
    meta("og:site_name", GLOSSARY.brand),
    meta("og:locale", ctx.intl.locale.replace("-", "_")),
    meta("og:url", url),
    meta("og:title", card.title),
    meta("og:description", desc),
    meta("og:image", card.imageUrl),
    meta("og:image:width", String(card.imageWidth)),
    meta("og:image:height", String(card.imageHeight)),
    meta("og:image:alt", card.title),
    meta("article:published_time", data.post.published_at.toISOString()),
    meta("article:modified_time", data.revision.created_at.toISOString()),
    meta("twitter:card", "summary_large_image", "name"),
    // schema.org microdata on <head> (QQ / some in-app browsers read itemprop).
    meta("name", card.title, "itemprop"),
    meta("description", desc, "itemprop"),
    meta("image", card.thumbUrl, "itemprop"),
  ].join("");
}

function authorBlock(ctx: ChromeContext, data: Pick<SharePost, "author" | "post">, following: boolean): string {
  const a = data.author;
  const name = a.display_name || `@${a.handle}`;
  const handle = a.display_name ? `<span>@${escapeHtml(a.handle)}</span><i class="ni-dot"></i>` : "";
  const at = data.post.published_at;
  const time = `<time datetime="${at.toISOString()}">${escapeHtml(ctx.intl.format.dateTime(at, { dateStyle: "medium", timeStyle: "short" }))}</time>`;
  // Content changed after publishing (web edit, app update or re-share; not media finishing).
  const e = data.post.edited_at;
  const when = e ? ctx.intl.t("share.post.edited", { time: ctx.intl.format.dateTime(e, { dateStyle: "medium", timeStyle: "short" }) }) : "";
  const edited = e ? `<i class="ni-dot"></i><span class="ni-edited" title="${escapeHtml(when)}">${escapeHtml(ctx.intl.t("share.post.editedShort"))}</span>` : "";
  return `<div class="ni-author">${avatarHtml(name, a.avatar_url, 52)}<div class="ni-who"><div class="ni-name">${escapeHtml(name)}</div><div class="ni-meta">${handle}${time}${edited}</div></div>${followButton(ctx, a.handle, following, "ni-follow-sm")}</div>`;
}

function sourceBlock(ctx: ChromeContext, data: SharePost): string {
  const badge = sourceBadge(data.post.source);
  if (!badge) return "";
  const app = badgeAppName(ctx.intl.t, badge);
  const inner = `<img src="${escapeHtml(badge.icon)}" width="18" height="18" alt="">${escapeHtml(ctx.intl.t("share.post.from", { app }))}`;
  return badge.href ? `<a class="ni-source" href="${escapeHtml(badge.href)}" target="_blank" rel="noopener">${inner}${icon("outLink")}</a>` : `<span class="ni-source">${inner}</span>`;
}

/** Source badge after the body (keeps the top of the post compact). */
function postFoot(ctx: ChromeContext, data: SharePost): string {
  const inner = sourceBlock(ctx, data);
  return inner ? `<div class="ni-post-foot">${inner}</div>` : "";
}

/** Wide screens: back to Discover above the article. */
function backLink(ctx: ChromeContext): string {
  return `<a class="ni-back" href="/discover"><span aria-hidden="true">${directionOf(ctx.intl.locale) === "rtl" ? "→" : "←"}</span>${escapeHtml(ctx.intl.t("discover.title"))}</a>`;
}

function bodyHtml(ctx: ChromeContext, data: SharePost): string {
  const { t } = ctx.intl;
  if (data.document.blocks.length === 0) return `<p class="ni-empty-body">${escapeHtml(t("share.post.empty"))}</p>`;
  return renderDocumentHtml(data.document, data.media, mediaUrlFor(data.post), { jobs: data.jobs, labels: { processing: t("share.media.processing"), unavailable: t("share.media.unavailable") } });
}

/** Result of the author's last failed action on this page (`?n=delete_failed` / `?n=visibility_failed`). */
export type PageNotice = "delete_failed" | "visibility_failed" | null;
const NOTICE_KEYS = { delete_failed: "share.delete.failed", visibility_failed: "share.visibility.failed" } as const;
export const pageNotice = (url: URL): PageNotice => {
  const n = url.searchParams.get("n");
  return n === "delete_failed" || n === "visibility_failed" ? n : null;
};
const noticeHtml = (ctx: ChromeContext, notice: PageNotice) =>
  notice ? `<p class="ni-compose-err" role="status">${escapeHtml(ctx.intl.t(NOTICE_KEYS[notice]))}</p>` : "";

/** Private post (its author is the only one who can open it): a short note above the post. */
const privateNote = (ctx: ChromeContext, post: Post) =>
  post.visibility === "private" ? `<p class="ni-private-note" role="note">${icon("lock")}<span>${escapeHtml(ctx.intl.t("share.post.privateNote"))}</span></p>` : "";

/** Server-rendered post page (plan §6, §16): complete without JS. */
export function renderPostPage(ctx: ChromeContext, data: SharePost, social: PageInteractions, aside: PostAside | null = null, following = false, notice: PageNotice = null): string {
  const { post } = data;
  const url = postUrl(post.slug);
  const short = post.kind === "short";
  const title = post.title && !short ? `<h1 class="ni-title">${escapeHtml(post.title)}</h1>` : "";
  const body = bodyHtml(ctx, { ...data, document: withTitleInText(post.kind, data.document) });
  const main =
    `<main class="ni-main">${aside ? backLink(ctx) : ""}${noticeHtml(ctx, notice)}${privateNote(ctx, post)}<article class="ni-post${short ? " ni-short" : ""}">` +
    `${authorBlock(ctx, data, following)}${title}<div class="ni-body">${body}</div>` +
    `${postFoot(ctx, data)}${postActions(ctx, post, social.liked, social.bookmarked)}</article>` +
    `${commentsSection(ctx, post, social, ctx.path)}${reportDialog(ctx, post.slug)}</main>`;
  const card = shareCard(post);
  const open = post.visibility === "public";
  // WeChat's in-app browser picks the first sizeable <img> as the thumbnail. Private posts: no card, never indexed.
  const wx = open ? `<div class="ni-wx"><img src="${escapeHtml(card.thumbUrl)}" width="600" height="600" alt=""></div>` : "";
  return renderPage(ctx, {
    title: `${card.title} · ${GLOSSARY.brand}`,
    head: open ? cardHead(ctx, data, url) : '<meta name="robots" content="noindex">',
    main: wx + main,
    // Wide-screen shell only outside mainland China (no site navigation there, plan §4.2).
    side: !!aside,
    tabBar: false,
    aside: aside ? renderPostAside(ctx, aside) : undefined,
  });
}

/**
 * A just-shared NiceNote post whose content has not arrived yet (usually a second or two):
 * author and a short note, never indexed, no actions. The page refreshes itself once.
 */
export function renderPreparingPage(ctx: ChromeContext, post: Post, author: Profile): string {
  const { t } = ctx.intl;
  const main =
    `<main class="ni-main"><article class="ni-post ni-short">${authorBlock(ctx, { post, author }, false)}` +
    `<div class="ni-body"><p class="ni-empty-body"><b>${escapeHtml(t("share.post.preparing.title"))}</b><br>${escapeHtml(t("share.post.preparing.body"))}</p></div></article></main>`;
  return renderPage(ctx, {
    title: `${t("share.post.preparing.title")} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex"><meta http-equiv="refresh" content="5">',
    main,
    tabBar: false,
  });
}
