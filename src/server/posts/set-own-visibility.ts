import type { Db } from "@/server/db/client";
import type { Post, PostVisibility } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { visibilityFields } from "@/server/nicenote/dto";
import { queuePostEvent } from "@/server/nicenote/post-events";
import { setPostVisibility, type VisibilityRuntime } from "./set-visibility";
import { SLUG_PATTERN } from "./slug";

/**
 * The author sets who may see a post on the web (any source). NiceNote shares tell the backend
 * (`visibility_changed`, nicenote/dto.ts: `visibility` public / private as before, `audience` the exact value),
 * so the app shows the same state. Null when the post does not exist or is someone else's.
 */
export async function setOwnPostVisibility(rt: VisibilityRuntime, userId: string, slug: string, visibility: PostVisibility): Promise<Post | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const post = await findPostBySlug(rt.db, slug);
  if (!post || post.author_id !== userId) return null;
  const notifyBackend = (trx: Db, changed: Post) => queuePostEvent(trx, changed, "visibility_changed", visibilityFields(changed));
  return (await setPostVisibility(rt, post.id, visibility, notifyBackend)).post;
}
