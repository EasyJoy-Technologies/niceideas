import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostById, updatePost } from "@/server/db/repos/posts";
import { ApiError, notFound } from "@/server/http/errors";
import { setPostVisibility, type VisibilityRuntime } from "@/server/posts/set-visibility";
import { isNarrower } from "@/server/posts/visibility";
import { unpublishPost } from "@/server/posts/withdraw-post";
import type { MediaStores } from "@/server/storage/types";
import type { ShareSettingsInput } from "./requests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A NiceNote share by post id; anything else looks nonexistent (404 `post.not_found`). */
export async function loadShare(db: Db, postId: string): Promise<Post> {
  const post = UUID.test(postId) ? await findPostById(db, postId) : undefined;
  if (!post || post.source !== "nicenote") throw notFound("post.not_found");
  return post;
}

/** Offline posts take no changes: taken down (409 `post.removed`) or deleted (409 `post.unpublished`). */
export function assertShareOpen(post: Post): void {
  if (post.status === "removed") throw new ApiError("post.removed", 409);
  if (post.status === "unpublished") throw new ApiError("post.unpublished", 409);
}

/** Legacy `visibility`: `private` keeps a post that is not public as it is (the app sees it as private already). */
const legacyTarget = (post: Post, v: ShareSettingsInput["visibility"]) => (v === "private" && post.visibility !== "public" ? undefined : v);

/**
 * PATCH: sync mode / comments mode (`null` = NiceIdeas default, open) / who may see it (set-visibility.ts).
 * The backend made the change (for the user in NiceNote, or an operator on its admin console), so no event goes
 * back. `audience` sets the exact value (v1.0.94); with `narrowOnly` only a narrower one (posts/visibility.ts). The legacy `visibility` knows public / private only (dto.ts):
 * `private` on a post that is not public (link, followers-only, friends-only: reported as `private`) keeps it as
 * it is.
 */
export async function updateShareSettings(rt: VisibilityRuntime, postId: string, input: ShareSettingsInput): Promise<Post> {
  const post = await loadShare(rt.db, postId);
  assertShareOpen(post);
  // Operators only narrow (Xianglin 2026-11-23): refused before anything changes, and again under the lock.
  const narrowCheck = (from: Post["visibility"], to: Post["visibility"]) => {
    if (input.narrowOnly && from !== to && !isNarrower(from, to)) throw new ApiError("post.visibility_not_narrower", 409);
  };
  const wanted = input.audience ?? legacyTarget(post, input.visibility);
  if (wanted) narrowCheck(post.visibility, wanted);
  const patch: { sync_mode?: Post["sync_mode"]; comments_mode?: Post["comments_mode"] } = {};
  if (input.syncMode && input.syncMode !== post.sync_mode) patch.sync_mode = input.syncMode;
  if (input.commentsMode !== undefined && (input.commentsMode ?? "open") !== post.comments_mode) patch.comments_mode = input.commentsMode ?? "open";
  const updated = Object.keys(patch).length ? await updatePost(rt.db, post.id, patch) : post;
  const to = input.audience ?? legacyTarget(updated, input.visibility);
  if (!to) return updated;
  return (await setPostVisibility(rt, post.id, to, async (_trx, _post, from) => narrowCheck(from, to))).post;
}

/** DELETE (the user deleted the share in NiceNote): link offline at once, idempotent. No event back to the backend. */
export async function deleteShare(db: Db, stores: MediaStores, postId: string, retentionDays: number): Promise<Post> {
  const post = await loadShare(db, postId);
  if (post.status === "removed") throw new ApiError("post.removed", 409);
  return (await unpublishPost(db, stores, post.id, retentionDays)).post;
}
