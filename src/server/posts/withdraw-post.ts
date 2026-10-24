import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { ApiError, notFound } from "@/server/http/errors";
import { withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";
import { loadOwnPost } from "./access";

/**
 * Takes a post offline as deleted by its author (plan §10; user-facing word "delete"): the page
 * answers 410 at once, media leave the public bucket, and everything is physically deleted after
 * the retention period. Deleting an already deleted post is a no-op (`changed: false`).
 * Taken-down posts (409 `post.removed`) and posts of an account being deleted (409 `post.not_active`) cannot be deleted.
 * `onDeleted` runs in the same transaction (e.g. queueing the backend notification atomically).
 */
export async function unpublishPost(
  db: Db, stores: MediaStores, postId: string, retentionDays: number, onDeleted?: (trx: Db, post: Post) => Promise<void>,
): Promise<{ post: Post; changed: boolean }> {
  const result = await db.transaction().execute(async (trx) => {
    const post = await lockPost(trx, postId);
    if (!post) throw notFound("post.not_found");
    if (post.status === "unpublished") return { post, changed: false, mediaIds: [] as string[] };
    if (post.status === "removed") throw new ApiError("post.removed", 409);
    if (post.status !== "active" && post.status !== "preparing") throw new ApiError("post.not_active", 409);
    const now = new Date();
    const updated = await updatePost(trx, post.id, {
      status: "unpublished",
      status_changed_at: now,
      status_reason: null,
      purge_after: new Date(now.getTime() + retentionDays * 86_400_000),
    });
    await onDeleted?.(trx, updated);
    const mediaIds = post.current_revision_id ? await listRevisionMediaIds(trx, post.current_revision_id) : [];
    return { post: updated, changed: true, mediaIds };
  });
  await withdrawUnreferencedMedia(db, stores, result.mediaIds).catch((e) => console.error("[delete] media withdrawal failed", postId, e));
  return { post: result.post, changed: result.changed };
}

/** External API withdrawal: only posts the caller may manage (others look nonexistent). Idempotent. */
export async function withdrawPost(db: Db, stores: MediaStores, principal: Principal, postId: string, retentionDays: number): Promise<Post> {
  const own = await loadOwnPost(db, principal, postId);
  return (await unpublishPost(db, stores, own.id, retentionDays)).post;
}
