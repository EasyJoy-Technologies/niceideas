import { cardTitle } from "./card";
import { publicUrl } from "@/server/media/keys";
import type { Media } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import type { PostAside } from "./load-post-aside";
import { followButton } from "./follow-button";
import { avatarHtml, profilePath } from "./profile-bits";

/** Smallest webp rendition (list thumbnails). */
function thumb(media: Media | null): string {
  if (!media || media.variants.kind !== "image") return `<span class="ni-thumb"></span>`;
  const smallest = [...media.variants.webp].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0] ?? media.variants.fallback;
  return `<img class="ni-thumb" src="${escapeHtml(publicUrl(smallest.key))}" alt="" loading="lazy" decoding="async">`;
}

/** Post page right column (v3 design): author card, then the author's other articles. */
export function renderPostAside(ctx: ChromeContext, a: PostAside): string {
  const { t, format } = ctx.intl;
  const p = a.author;
  const name = p.display_name || `@${p.handle}`;
  const href = profilePath(p.handle);
  const num = (n: number) => escapeHtml(format.number(n, { notation: "compact", maximumFractionDigits: 1 }));
  const stat = (n: number, key: string) => `<span><b>${num(n)}</b> ${escapeHtml(t(`profile.stats.${key}`))}</span>`;
  const card =
    `<section class="ni-card ni-author-card"><a class="ni-author-top" href="${href}">${avatarHtml(name, p.avatar_url, 52)}` +
    `<span class="ni-who"><span class="ni-name">${escapeHtml(name)}</span><span class="ni-meta">@${escapeHtml(p.handle)}</span></span></a>` +
    (p.bio ? `<p>${escapeHtml(p.bio)}</p>` : "") +
    `<div class="ni-author-stats">${stat(a.stats.posts, "posts")}${stat(a.stats.followers, "followers")}${stat(a.stats.likes, "likes")}</div>` +
    `${followButton(ctx, p.handle, !!a.following, "ni-follow-wide")}</section>`;
  if (!a.more.length) return card;
  const items = a.more
    .map(({ post, cover }) => {
      const at = escapeHtml(format.dateTime(post.published_at, { dateStyle: "medium" }));
      return `<a class="ni-mini" href="/p/${post.slug}">${thumb(cover)}<span><b>${escapeHtml(cardTitle(post))}</b><small>${at}</small></span></a>`;
    })
    .join("");
  const all = `<a href="${href}?tab=articles">${escapeHtml(t("feed.tab.all"))}</a>`;
  return `${card}<section class="ni-card ni-box"><h2>${escapeHtml(t("share.aside.moreArticles"))}${all}</h2>${items}</section>`;
}
