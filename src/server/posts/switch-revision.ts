import type { Db } from "@/server/db/client";
import type { Post, PostUpdate } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, insertRevision, linkRevisionMedia, listRevisionMediaIds } from "@/server/db/repos/revisions";
import { contentHash } from "@/server/documents/hash";
import type { PostDocument } from "@/server/documents/schema";
import { ApiError } from "@/server/http/errors";
import { projectMediaPublic, recordMediaPublic, withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";
import { derivedFields } from "./derived-fields";
import { resolveDocumentMedia } from "./media-refs";
import { assertCanCreateRevision } from "./rate-limit";

export type SwitchResult = { post: Post; contentHash: string; changed: boolean };

export type SwitchOptions = {
  cacheControl: string;
  /** Revision's source time (app edits); web edits keep the post's. */
  sourceUpdatedAt: Date | null;
  /** Refuses the change (throws) or skips it (returns false); re-run under the row lock. */
  check: (post: Post) => boolean;
  /** Extra post fields written with the new revision. */
  extra: (post: Post) => PostUpdate;
};

/**
 * New content for a post (API-format document): same content → no-op; otherwise media move to the
 * public store, a new revision is switched in atomically (the link stays the same) and media the
 * new revision no longer uses leave the public store. Shared by app syncs and web edits.
 */
export async function switchRevision(db: Db, stores: MediaStores, actorId: string, before: Post, document: PostDocument, opts: SwitchOptions): Promise<SwitchResult> {
  const hash = contentHash(document);
  if (!opts.check(before)) return { post: before, contentHash: hash, changed: false };
  const current = before.current_revision_id ? await findRevision(db, before.current_revision_id) : undefined;
  if (current?.content_hash === hash) return { post: before, contentHash: hash, changed: false };

  await assertCanCreateRevision(db, actorId);
  const media = await resolveDocumentMedia(db, before.author_id, document);
  await projectMediaPublic(stores, media, opts.cacheControl);

  const outcome = await db.transaction().execute(async (trx) => {
    const post = await lockPost(trx, before.id);
    if (!post) throw new ApiError("post.not_found", 404);
    if (!opts.check(post)) return { post, changed: false, previousMedia: [] as string[] };
    const prev = post.current_revision_id ? await findRevision(trx, post.current_revision_id) : undefined;
    if (prev?.content_hash === hash) return { post, changed: false, previousMedia: [] as string[] };

    const rev = await insertRevision(trx, { postId: post.id, document, contentHash: hash, sourceUpdatedAt: opts.sourceUpdatedAt });
    await linkRevisionMedia(trx, rev.id, media.map((m) => m.id));
    await recordMediaPublic(trx, media.map((m) => m.id));
    const updated = await updatePost(trx, post.id, { ...derivedFields(document, post), current_revision_id: rev.id, ...opts.extra(post) });
    const previousMedia = prev ? await listRevisionMediaIds(trx, prev.id) : [];
    return { post: updated, changed: true, previousMedia };
  });

  // Media dropped by this change leave the public store (failures are retried by reconciliation).
  const dropped = outcome.previousMedia.filter((id) => !media.some((m) => m.id === id));
  await withdrawUnreferencedMedia(db, stores, dropped).catch((e) => console.error("[revision] media withdrawal failed", outcome.post.id, e));
  return { post: outcome.post, contentHash: hash, changed: outcome.changed };
}
