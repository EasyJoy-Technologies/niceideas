import { getConfig } from "@/server/config/env";
import type { Post, Profile } from "@/server/db/schema";

/** Share-card data used by the page's meta tags and returned to apps for native sharing (plan §16.3). */
export type ShareCard = {
  title: string;
  description: string;
  /** 1200×630 JPEG (most platforms). */
  imageUrl: string;
  /** 600×600 JPEG (WeChat / QQ thumbnails). */
  thumbUrl: string;
  imageWidth: number;
  imageHeight: number;
};

const CARD_TITLE_CHARS = 60;

const base = () => getConfig().PUBLIC_BASE_URL.replace(/\/+$/, "");

/** Short posts have no title: the opening words of the summary stand in. */
export function cardTitle(post: Pick<Post, "title" | "summary">): string {
  if (post.title) return post.title;
  const chars = Array.from(post.summary.replace(/…$/, ""));
  return chars.length <= CARD_TITLE_CHARS ? chars.join("") : `${chars.slice(0, CARD_TITLE_CHARS).join("").trimEnd()}…`;
}

/** Share title of a post with no title and no text (images / audio only): its author, as on the profile page. */
export const authorCardTitle = (author: Pick<Profile, "display_name" | "handle">): string =>
  author.display_name ? `${author.display_name} (@${author.handle})` : `@${author.handle}`;

/**
 * Cover-based images are versioned by the post's last change so caches refresh after edits.
 * `fallbackTitle`: the title when the post has neither title nor text (authorCardTitle).
 */
export function shareCard(post: Pick<Post, "slug" | "title" | "summary" | "cover_media_id" | "updated_at">, fallbackTitle: string): ShareCard {
  const root = base();
  const v = post.updated_at.getTime().toString(36);
  const cover = post.cover_media_id !== null;
  return {
    title: cardTitle(post) || fallbackTitle,
    description: post.summary,
    imageUrl: cover ? `${root}/p/${post.slug}/og/wide.jpg?v=${v}` : `${root}/brand/og-default.png`,
    thumbUrl: cover ? `${root}/p/${post.slug}/og/square.jpg?v=${v}` : `${root}/brand/og-default-square.png`,
    imageWidth: 1200,
    imageHeight: 630,
  };
}
