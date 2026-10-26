import type { Db } from "@/server/db/client";
import type { Media } from "@/server/db/schema";
import { filterPubliclyReferenced, filterReferencedByAnyPost, findMediaByIds, markMediaPublic, markMediaWithdrawn } from "@/server/db/repos/media";
import { moveObject } from "@/server/storage/move";
import type { MediaStores } from "@/server/storage/types";
import { renditionsOf } from "./keys";

/**
 * Moves media renditions from the private store to the public store (server-side; one stored copy
 * per file) so the share page can reference them. Idempotent: renditions already public stay.
 * Run BEFORE committing the transaction that makes the post reference them; after a failure the
 * files sit public under unguessable keys until a later publish or withdrawal moves them again.
 */
export async function projectMediaPublic(stores: MediaStores, media: Media[], cacheControl: string): Promise<void> {
  for (const m of media) {
    for (const r of renditionsOf(m)) await moveObject(stores.privateStore, stores.publicStore, r.key, { contentType: r.mime, cacheControl });
  }
}

/** Moves media renditions back to the private store (withdrawal); idempotent. */
async function moveMediaPrivate(stores: MediaStores, media: Media[]): Promise<void> {
  for (const m of media) {
    for (const r of renditionsOf(m)) await moveObject(stores.publicStore, stores.privateStore, r.key, { contentType: r.mime });
  }
}

/** Records that the given media are now publicly served. Call inside the publishing transaction. */
export async function recordMediaPublic(db: Db, mediaIds: string[]): Promise<void> {
  await markMediaPublic(db, mediaIds);
}

/**
 * After a commit that may have stopped referencing media (sync dropped an image,
 * post withdrawn, …): moves back to the private store every candidate that is no
 * longer referenced by any active post, and starts the detach clock for media
 * no post references at all. Safe to re-run; failures are logged and retried by
 * the daily reconciliation job.
 */
export async function withdrawUnreferencedMedia(db: Db, stores: MediaStores, candidateIds: string[]): Promise<void> {
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) return;
  const stillPublic = await filterPubliclyReferenced(db, ids);
  const toWithdraw = ids.filter((id) => !stillPublic.has(id));
  if (toWithdraw.length === 0) return;
  const media = await findMediaByIds(db, toWithdraw);
  await moveMediaPrivate(stores, media);
  const anyRef = await filterReferencedByAnyPost(db, toWithdraw);
  await markMediaWithdrawn(db, toWithdraw.filter((id) => anyRef.has(id)), false);
  await markMediaWithdrawn(db, toWithdraw.filter((id) => !anyRef.has(id)), true);
}

/**
 * After the commit that decided which media are live (author / post state re-checked under the
 * locks): media moved to the public store beforehand but not live go back (unless another active
 * post uses them); live media not moved yet are moved and recorded now. Safe to re-run.
 */
export async function settlePublication(db: Db, stores: MediaStores, cacheControl: string, s: { moved: string[]; live: string[] }): Promise<void> {
  const moved = new Set(s.moved);
  const live = new Set(s.live);
  const late = [...live].filter((id) => !moved.has(id));
  if (late.length) {
    await projectMediaPublic(stores, await findMediaByIds(db, late), cacheControl);
    await recordMediaPublic(db, late);
  }
  await withdrawUnreferencedMedia(db, stores, s.moved.filter((id) => !live.has(id)));
}
