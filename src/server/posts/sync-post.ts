import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, insertRevision, linkRevisionMedia, listRevisionMediaIds } from "@/server/db/repos/revisions";
import { contentHash } from "@/server/documents/hash";
import type { PostDocument } from "@/server/documents/schema";
import { ApiError } from "@/server/http/errors";
import { projectMediaPublic, recordMediaPublic, withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";
import { assertEditable, loadOwnPost } from "./access";
import { derivedFields } from "./derived-fields";
import { resolveDocumentMedia } from "./media-refs";
import { assertCanCreateRevision } from "./rate-limit";

export type SyncResult = { post: Post; contentHash: string; changed: boolean };

/** Rejects pushes that cannot apply (design §5). Re-run under the row lock. */
function assertSyncable(post: Post, sourceUpdatedAt: Date): void {
  assertEditable(post);
  if (post.sync_mode === "frozen") throw new ApiError("post.frozen", 409);
  if (post.source_updated_at && sourceUpdatedAt < post.source_updated_at) {
    throw new ApiError("post.stale_update", 409, { current: post.source_updated_at.toISOString() });
  }
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
  assertSyncable(before, input.sourceUpdatedAt);
  const hash = contentHash(input.document);
  const current = before.current_revision_id ? await findRevision(db, before.current_revision_id) : undefined;
  if (current?.content_hash === hash) return { post: before, contentHash: hash, changed: false };

  await assertCanCreateRevision(db, principal.userId);
  const media = await resolveDocumentMedia(db, principal.userId, input.document);
  await projectMediaPublic(stores, media, cacheControl);

  const outcome = await db.transaction().execute(async (trx) => {
    const post = await lockPost(trx, before.id);
    if (!post) throw new ApiError("post.not_found", 404);
    assertSyncable(post, input.sourceUpdatedAt);
    const prev = post.current_revision_id ? await findRevision(trx, post.current_revision_id) : undefined;
    if (prev?.content_hash === hash) return { post, changed: false, previousMedia: [] as string[] };

    const rev = await insertRevision(trx, { postId: post.id, document: input.document, contentHash: hash, sourceUpdatedAt: input.sourceUpdatedAt });
    await linkRevisionMedia(trx, rev.id, media.map((m) => m.id));
    await recordMediaPublic(trx, media.map((m) => m.id));
    const updated = await updatePost(trx, post.id, {
      ...derivedFields(input.document, post),
      current_revision_id: rev.id,
      source_updated_at: input.sourceUpdatedAt,
    });
    const previousMedia = prev ? await listRevisionMediaIds(trx, prev.id) : [];
    return { post: updated, changed: true, previousMedia };
  });

  // Media dropped by this edit leave the public bucket (failures are retried by reconciliation).
  const dropped = outcome.previousMedia.filter((id) => !media.some((m) => m.id === id));
  await withdrawUnreferencedMedia(db, stores, dropped).catch((e) => console.error("[sync] media withdrawal failed", outcome.post.id, e));
  return { post: outcome.post, contentHash: hash, changed: outcome.changed };
}
