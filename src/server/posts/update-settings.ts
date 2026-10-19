import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post, PostKind, PostUpdate, SyncMode } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision } from "@/server/db/repos/revisions";
import { deriveCoverMediaId, deriveKind, deriveSummary } from "@/server/documents/derive";
import { documentSchema } from "@/server/documents/schema";
import { ApiError } from "@/server/http/errors";
import { assertEditable, loadOwnPost } from "./access";

/** `null` clears an author override and returns the field to automatic derivation. */
export type PostSettings = {
  summary?: string | null;
  coverMediaId?: string | null;
  kind?: PostKind | null;
  syncMode?: SyncMode;
};

/** Changes author-controlled presentation settings (plan §8 PATCH). */
export async function updatePostSettings(db: Db, principal: Principal, postId: string, input: PostSettings): Promise<Post> {
  await loadOwnPost(db, principal, postId);
  return db.transaction().execute(async (trx) => {
    const post = await lockPost(trx, postId);
    if (!post) throw new ApiError("post.not_found", 404);
    assertEditable(post);
    const rev = post.current_revision_id ? await findRevision(trx, post.current_revision_id) : undefined;
    const doc = documentSchema.parse(rev?.document);
    const patch: PostUpdate = {};

    if (input.summary !== undefined) {
      patch.summary = input.summary === null ? deriveSummary(doc) : input.summary.trim();
      patch.summary_locked = input.summary !== null;
    }
    if (input.coverMediaId !== undefined) {
      if (input.coverMediaId !== null && !doc.blocks.some((b) => b.type === "image" && b.mediaId === input.coverMediaId)) {
        throw new ApiError("post.cover_not_in_document", 422);
      }
      patch.cover_media_id = input.coverMediaId ?? deriveCoverMediaId(doc);
      patch.cover_locked = input.coverMediaId !== null;
    }
    if (input.kind !== undefined) {
      patch.kind = input.kind ?? deriveKind(doc);
      patch.kind_locked = input.kind !== null;
    }
    if (input.syncMode !== undefined) patch.sync_mode = input.syncMode;
    return Object.keys(patch).length ? updatePost(trx, post.id, patch) : post;
  });
}
