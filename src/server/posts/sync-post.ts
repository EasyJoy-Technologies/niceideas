import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import type { PostDocument } from "@/server/documents/schema";
import { ApiError } from "@/server/http/errors";
import type { MediaStores } from "@/server/storage/types";
import { assertEditable, loadOwnPost } from "./access";
import { switchRevision, type SwitchResult } from "./switch-revision";

export type SyncResult = SwitchResult;

/**
 * Whether an app update applies (design §5): offline / frozen posts and older note versions are
 * refused (409); after a web edit, an update of the same version (a retry) is skipped silently.
 */
function syncApplies(post: Post, sourceUpdatedAt: Date): boolean {
  assertEditable(post);
  if (post.sync_mode === "frozen") throw new ApiError("post.frozen", 409);
  if (post.source_updated_at && sourceUpdatedAt < post.source_updated_at) {
    throw new ApiError("post.stale_update", 409, { current: post.source_updated_at.toISOString() });
  }
  return !(post.web_edited && post.source_updated_at && sourceUpdatedAt <= post.source_updated_at);
}

/**
 * Edit sync (plan §8): same content → no-op; older note version → 409;
 * otherwise a new revision is switched in atomically and the link stays the same.
 */
export async function syncPost(
  db: Db,
  stores: MediaStores,
  principal: Principal,
  input: { postId: string; document: PostDocument; sourceUpdatedAt: Date },
  cacheControl: string,
): Promise<SyncResult> {
  const before = await loadOwnPost(db, principal, input.postId);
  return switchRevision(db, stores, principal.userId, before, input.document, {
    cacheControl,
    sourceUpdatedAt: input.sourceUpdatedAt,
    check: (post) => syncApplies(post, input.sourceUpdatedAt),
    extra: () => ({ source_updated_at: input.sourceUpdatedAt, edited_at: new Date(), web_edited: false }),
  });
}
