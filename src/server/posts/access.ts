import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostById, lockPost } from "@/server/db/repos/posts";
import { ApiError, notFound } from "@/server/http/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First-party clients manage NiceNote publications; an third-party client only its own (`api:<key>`). */
function canManage(principal: Principal, post: Post): boolean {
  if (post.author_id !== principal.userId) return false;
  return principal.kind === "third_party" ? post.source === principal.source : post.source.startsWith("nicenote_");
}

/** Loads a post the caller may manage; other users' posts look nonexistent (404). */
export async function loadOwnPost(db: Db, principal: Principal, id: string, lock = false): Promise<Post> {
  if (!UUID.test(id)) throw notFound("post.not_found");
  const post = lock ? await lockPost(db, id) : await findPostById(db, id);
  if (!post || !canManage(principal, post)) throw notFound("post.not_found");
  return post;
}

/** Mutations other than withdrawal require a live, author-controlled post. */
export function assertEditable(post: Post): void {
  if (post.status === "removed") throw new ApiError("post.removed", 409);
  if (post.status !== "active") throw new ApiError("post.not_active", 409);
}
