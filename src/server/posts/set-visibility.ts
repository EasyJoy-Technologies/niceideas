import { lockAuthor, readAuthorState } from "@/server/accounts/author-gate";
import { queuePostPurge, queueReturningMediaPurge } from "@/server/cdn/purge-queue";
import type { Db } from "@/server/db/client";
import type { Post, PostVisibility } from "@/server/db/schema";
import { findMediaByIds } from "@/server/db/repos/media";
import { findPostById, lockPost, updatePost } from "@/server/db/repos/posts";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { ApiError, notFound } from "@/server/http/errors";
import { finishPublication, NO_PROJECTION, projectMediaPublic, queueVisibilityCheck, recordPublication, type Projection } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";

export type VisibilityRuntime = { db: Db; stores: MediaStores; cacheControl: string };

/** Runs in the changing transaction (e.g. telling the backend about a change made on the web). */
export type OnVisibilityChanged = (trx: Db, post: Post) => Promise<void>;

/** Deleted (409 `post.unpublished`) and taken-down (409 `post.removed`) posts keep their setting. */
function assertChangeable(post: Post): void {
  if (post.status === "removed") throw new ApiError("post.removed", 409);
  if (post.status === "unpublished") throw new ApiError("post.unpublished", 409);
}

/**
 * Makes a post private (author only) or public again (plan docs/plan/2026-10-26-private-theme-guidelines.md C).
 * Private: the page, share card and interactions answer 404 to everyone else at once, the media leave the
 * public store and the CDN edge. Public: media move back before the commit (no broken images); the post
 * returns to its old place in feeds (published_at unchanged) without notifying anyone. Same value → no-op.
 */
export async function setPostVisibility(
  rt: VisibilityRuntime, postId: string, visibility: PostVisibility, onChanged?: OnVisibilityChanged,
): Promise<{ post: Post; changed: boolean }> {
  const before = await findPostById(rt.db, postId);
  if (!before) throw notFound("post.not_found");
  assertChangeable(before);
  if (before.visibility === visibility) return { post: before, changed: false };
  const mediaIds = before.current_revision_id ? await listRevisionMediaIds(rt.db, before.current_revision_id) : [];
  const goesLive = visibility === "public" && before.status === "active" && (await readAuthorState(rt.db, before.author_id)) === "active";
  const projection: Projection = goesLive ? await projectMediaPublic(rt, await findMediaByIds(rt.db, mediaIds)) : NO_PROJECTION;
  let touched: string[] = [];
  try {
    const outcome = await rt.db.transaction().execute(async (trx) => {
      // Author first, then post (author-gate.ts).
      const author = await lockAuthor(trx, before.author_id);
      const post = await lockPost(trx, postId);
      if (!post || author === "gone") throw notFound("post.not_found");
      assertChangeable(post);
      if (post.visibility === visibility) return { post, changed: false };
      const updated = await updatePost(trx, post.id, { visibility, visibility_changed_at: new Date() });
      // The current revision may have changed since it was read: settle the media it uses now.
      const current = post.current_revision_id ? await listRevisionMediaIds(trx, post.current_revision_id) : [];
      if (visibility === "private") {
        await queuePostPurge(trx, [post.slug]);
        await queueVisibilityCheck(trx, current);
        touched = current;
      } else {
        const live = post.status === "active" && author === "active" ? current : [];
        touched = await recordPublication(trx, projection, live);
        await queueReturningMediaPurge(trx, live);
      }
      await onChanged?.(trx, updated);
      return { post: updated, changed: true };
    });
    return outcome;
  } finally {
    // Media leave (private) or are settled (public) now; anything failing stays due for the worker.
    await finishPublication(rt, projection, touched);
  }
}
