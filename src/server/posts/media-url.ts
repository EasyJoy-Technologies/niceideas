import type { Post } from "@/server/db/schema";
import { publicUrl } from "@/server/media/keys";

/** Turns an object key into the URL a page uses for it. */
export type MediaUrl = (key: string) => string;

/** Author-only address of a private post's media (src/app/p/[slug]/media/[...key]). */
export const ownMediaUrl = (slug: string, key: string) => `/p/${slug}/media/${key}`;

/** Public posts link the public media domain; private ones the author-only route (their media are not public). */
export function mediaUrlFor(post: Pick<Post, "slug" | "visibility">): MediaUrl {
  return post.visibility === "private" ? (key) => ownMediaUrl(post.slug, key) : publicUrl;
}
