import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { queuePostEvent } from "@/server/nicenote/post-events";
import type { MediaStores } from "@/server/storage/types";
import { SLUG_PATTERN } from "./slug";
import { unpublishPost } from "./withdraw-post";

/**
 * The author deletes a post on the web (any source: web, NiceNote, third-party app). NiceNote shares
 * tell the backend (`unpublished`), so sharing the note again gets a new link. Returns null when
 * the post does not exist or is someone else's.
 */
export async function deleteOwnPost(db: Db, stores: MediaStores, userId: string, slug: string, retentionDays: number): Promise<Post | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const post = await findPostBySlug(db, slug);
  if (!post || post.author_id !== userId) return null;
  const notifyBackend = (trx: Db, deleted: Post) => queuePostEvent(trx, deleted, "unpublished");
  return (await unpublishPost(db, stores, post.id, retentionDays, notifyBackend)).post;
}
