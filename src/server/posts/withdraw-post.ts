import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { updatePost } from "@/server/db/repos/posts";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { ApiError } from "@/server/http/errors";
import { withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";
import { loadOwnPost } from "./access";

/**
 * Author withdrawal (plan §10): the page answers 410 at once, media leave the
 * public bucket, and everything is physically deleted after the retention period.
 * Withdrawing an already withdrawn post is a no-op.
 */
export async function withdrawPost(db: Db, stores: MediaStores, principal: Principal, postId: string, retentionDays: number): Promise<Post> {
  const result = await db.transaction().execute(async (trx) => {
    const post = await loadOwnPost(trx, principal, postId, true);
    if (post.status === "unpublished") return { post, mediaIds: [] as string[] };
    if (post.status === "removed") throw new ApiError("post.removed", 409);
    if (post.status !== "active") throw new ApiError("post.not_active", 409);
    const now = new Date();
    const updated = await updatePost(trx, post.id, {
      status: "unpublished",
      status_changed_at: now,
      status_reason: null,
      purge_after: new Date(now.getTime() + retentionDays * 86_400_000),
    });
    const mediaIds = post.current_revision_id ? await listRevisionMediaIds(trx, post.current_revision_id) : [];
    return { post: updated, mediaIds };
  });
  await withdrawUnreferencedMedia(db, stores, result.mediaIds).catch((e) => console.error("[withdraw] media withdrawal failed", postId, e));
  return result.post;
}
