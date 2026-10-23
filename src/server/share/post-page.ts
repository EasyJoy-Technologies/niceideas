import { GLOSSARY } from "@/i18n/glossary";
import { publicUrl } from "@/server/media/keys";
import { postUrl } from "@/server/posts/post-dto";
import { renderDocumentHtml } from "@/server/render/document-html";
import { escapeHtml } from "@/server/render/escape";
import { shareCard } from "./card";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { followButton } from "./follow-button";
import { icon } from "./icons";
import type { SharePost } from "./load-post";
import { commentsSection, reportDialog } from "./comments-section";
import type { PageInteractions } from "./load-interactions";
import type { PostAside } from "./load-post-aside";
import { postActions } from "./post-actions";
import { renderPostAside } from "./post-aside";
import { directionOf } from "@/i18n/locales";
import { avatarHtml } from "./profile-bits";
import { badgeAppName, sourceBadge } from "./sources";

/** Edits within this window after publishing are not shown as "edited". */
const EDIT_GRACE_MS = 60_000;

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

function authorBlock(ctx: ChromeContext, data: SharePost, following: boolean): string {
  const a = data.author;
  const name = a.display_name || `@${a.handle}`;
  const handle = a.display_name ? `<span>@${escapeHtml(a.handle)}</span><i class="ni-dot"></i>` : "";
  const at = data.post.published_at;
  const time = `<time datetime="${at.toISOString()}">${escapeHtml(ctx.intl.format.dateTime(at, { dateStyle: "medium", timeStyle: "short" }))}</time>`;
  return `<div class="ni-author">${avatarHtml(name, a.avatar_url, 52)}<div class="ni-who"><div class="ni-name">${escapeHtml(name)}</div><div class="ni-meta">${handle}${time}</div></div>${followButton(ctx, a.handle, following, "ni-follow-sm")}</div>`;
}

function sourceBlock(ctx: ChromeContext, data: SharePost): string {
  const badge = sourceBadge(data.post.source);
  if (!badge) return "";
  const app = badgeAppName(ctx.intl.t, badge);
  const inner = `<img src="${escapeHtml(badge.icon)}" width="18" height="18" alt="">${escapeHtml(ctx.intl.t("share.post.from", { app }))}`;
  return badge.href ? `<a class="ni-source" href="${escapeHtml(badge.href)}" target="_blank" rel="noopener">${inner}${icon("outLink")}</a>` : `<span class="ni-source">${inner}</span>`;
}

function editedBlock(ctx: ChromeContext, data: SharePost): string {
  const edited = data.revision.created_at;
  if (edited.getTime() - data.post.published_at.getTime() < EDIT_GRACE_MS) return "";
  const time = `<time datetime="${edited.toISOString()}">${escapeHtml(ctx.intl.format.dateTime(edited, { dateStyle: "medium", timeStyle: "short" }))}</time>`;
  // The label is translated text; only the time element is markup.
  const [before, after = ""] = ctx.intl.t("share.post.edited", { time: "\u0000" }).split("\u0000");
  return `<div class="ni-edited">${escapeHtml(before)}${time}${escapeHtml(after)}</div>`;
}

/** Source badge and "edited" note after the body (keeps the top of the post compact). */
function postFoot(ctx: ChromeContext, data: SharePost): string {
  const inner = sourceBlock(ctx, data) + editedBlock(ctx, data);
  return inner ? `<div class="ni-post-foot">${inner}</div>` : "";
}

/** Wide screens: back to Discover above the article. */
function backLink(ctx: ChromeContext): string {
  return `<a class="ni-back" href="/discover"><span aria-hidden="true">${directionOf(ctx.intl.locale) === "rtl" ? "→" : "←"}</span>${escapeHtml(ctx.intl.t("discover.title"))}</a>`;
}

/** Server-rendered post page (plan §6, §16): complete without JS. */
export function renderPostPage(ctx: ChromeContext, data: SharePost, social: PageInteractions, aside: PostAside | null = null, following = false): string {
  const { post, document } = data;
  const url = postUrl(post.slug);
  const title = post.title ? `<h1 class="ni-title">${escapeHtml(post.title)}</h1>` : "";
  const body = renderDocumentHtml(document, data.media, publicUrl);
  const main =
    `<main class="ni-main">${aside ? backLink(ctx) : ""}<article class="ni-post${post.kind === "short" ? " ni-short" : ""}">` +
    `${authorBlock(ctx, data, following)}${title}<div class="ni-body">${body}</div>` +
    `${postFoot(ctx, data)}${postActions(ctx, post, social.liked)}</article>` +
    `${commentsSection(ctx, post, social, ctx.path)}${reportDialog(ctx, post.slug)}</main>`;
  const card = shareCard(post);
  // WeChat's in-app browser picks the first sizeable <img> as the thumbnail.
  const wx = `<div class="ni-wx"><img src="${escapeHtml(card.thumbUrl)}" width="600" height="600" alt=""></div>`;
  return renderPage(ctx, {
    title: `${card.title} · ${GLOSSARY.brand}`,
    head: cardHead(ctx, data, url),
    main: wx + main,
    // Wide-screen shell only outside mainland China (no site navigation there, plan §4.2).
    side: !!aside,
    tabBar: false,
    aside: aside ? renderPostAside(ctx, aside) : undefined,
  });
}
