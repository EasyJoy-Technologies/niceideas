import type { Post } from "@/server/db/schema";
import { publicUrl } from "@/server/media/keys";

/** Turns an object key into the URL a page uses for it. */
export type MediaUrl = (key: string) => string;

/** Address of the media of a post that is not public, checked per viewer (src/app/p/[slug]/media/[...key]). */
export const ownMediaUrl = (slug: string, key: string) => `/p/${slug}/media/${key}`;

/** Public posts link the public media domain; the others the checked route (their media are not public). */
export function mediaUrlFor(post: Pick<Post, "slug" | "visibility">): MediaUrl {
  return post.visibility === "public" ? publicUrl : (key) => ownMediaUrl(post.slug, key);
}
