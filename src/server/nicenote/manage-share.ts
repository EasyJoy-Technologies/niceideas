import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostById, updatePost } from "@/server/db/repos/posts";
import { ApiError, notFound } from "@/server/http/errors";
import { setPostVisibility, type VisibilityRuntime } from "@/server/posts/set-visibility";
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

/**
 * PATCH: sync mode / comments mode (`null` = NiceIdeas default, open) / visibility (private = the author
 * only; set-visibility.ts). The backend made the change, so no event goes back.
 */
export async function updateShareSettings(rt: VisibilityRuntime, postId: string, input: ShareSettingsInput): Promise<Post> {
  const post = await loadShare(rt.db, postId);
  assertShareOpen(post);
  const patch: { sync_mode?: Post["sync_mode"]; comments_mode?: Post["comments_mode"] } = {};
  if (input.syncMode && input.syncMode !== post.sync_mode) patch.sync_mode = input.syncMode;
  if (input.commentsMode !== undefined && (input.commentsMode ?? "open") !== post.comments_mode) patch.comments_mode = input.commentsMode ?? "open";
  const updated = Object.keys(patch).length ? await updatePost(rt.db, post.id, patch) : post;
  return input.visibility ? (await setPostVisibility(rt, post.id, input.visibility)).post : updated;
}

/** DELETE (the user deleted the share in NiceNote): link offline at once, idempotent. No event back to the backend. */
export async function deleteShare(db: Db, stores: MediaStores, postId: string, retentionDays: number): Promise<Post> {
  const post = await loadShare(db, postId);
  if (post.status === "removed") throw new ApiError("post.removed", 409);
  return (await unpublishPost(db, stores, post.id, retentionDays)).post;
}
