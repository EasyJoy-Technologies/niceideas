import type { Db } from "@/server/db/client";
import type { Media, Post, PostUpdate } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, insertRevision, linkRevisionMedia, listRevisionMediaIds } from "@/server/db/repos/revisions";
import { contentHash } from "@/server/documents/hash";
import type { PostDocument } from "@/server/documents/schema";
import { ApiError } from "@/server/http/errors";
import { accountDeleting, assertAuthorActive, readAuthorState } from "@/server/accounts/author-gate";
import { finishPublication, projectMediaPublic, recordPublication, type Projection } from "@/server/media/publication";
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

  if ((await readAuthorState(db, before.author_id)) !== "active") throw accountDeleting();
  await assertCanCreateRevision(db, actorId);
  const media = await resolveDocumentMedia(db, before.author_id, document);
  const rt = { db, stores, cacheControl: opts.cacheControl };
  const projection = await projectMediaPublic(rt, media);
  let touched: string[] = [];
  try {
    const outcome = await commitSwitch(db, before, document, hash, media, projection, opts);
    touched = outcome.touched;
    return { post: outcome.post, contentHash: hash, changed: outcome.changed };
  } finally {
    // Unchanged or refused under the lock: the media moved for nothing go back; dropped ones leave.
    await finishPublication(rt, projection, touched);
  }
}

/** The switch itself, under the author lock then the post lock (author-gate.ts). */
async function commitSwitch(db: Db, before: Post, document: PostDocument, hash: string, media: Media[], projection: Projection, opts: SwitchOptions) {
  return db.transaction().execute(async (trx) => {
    await assertAuthorActive(trx, before.author_id);
    const post = await lockPost(trx, before.id);
    if (!post) throw new ApiError("post.not_found", 404);
    if (!opts.check(post)) return { post, changed: false, touched: [] as string[] };
    const prev = post.current_revision_id ? await findRevision(trx, post.current_revision_id) : undefined;
    if (prev?.content_hash === hash) return { post, changed: false, touched: [] as string[] };

    const rev = await insertRevision(trx, { postId: post.id, document, contentHash: hash, sourceUpdatedAt: opts.sourceUpdatedAt });
    const ids = media.map((m) => m.id);
    await linkRevisionMedia(trx, rev.id, ids);
    const dropped = prev ? (await listRevisionMediaIds(trx, prev.id)).filter((id) => !ids.includes(id)) : [];
    const touched = await recordPublication(trx, projection, ids, dropped);
    const updated = await updatePost(trx, post.id, { ...derivedFields(document, post), current_revision_id: rev.id, ...opts.extra(post) });
    return { post: updated, changed: true, touched };
  });
}
