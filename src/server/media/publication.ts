import type { Db } from "@/server/db/client";
import type { Media } from "@/server/db/schema";
import { filterPubliclyReferenced, filterReferencedByAnyPost, findMediaByIds, markMediaPublic, markMediaWithdrawn } from "@/server/db/repos/media";
import type { MediaStores } from "@/server/storage/types";
import { renditionsOf } from "./keys";

/**
 * Copies media renditions from the private store to the public store so the
 * share page can reference them. Idempotent (re-copy is harmless). Run BEFORE
 * committing the transaction that makes the post reference them; a failure
 * leaves at most unreferenced public copies, which `reconcilePublicMedia` removes.
 */
export async function projectMediaPublic(stores: MediaStores, media: Media[], cacheControl: string): Promise<void> {
  for (const m of media) {
    for (const r of renditionsOf(m)) {
      const body = await stores.privateStore.getStream(r.key);
      await stores.publicStore.putStream(r.key, body, { contentType: r.mime, cacheControl, contentLength: r.bytes });
    }
  }
}

/** Records that the given media are now publicly served. Call inside the publishing transaction. */
export async function recordMediaPublic(db: Db, mediaIds: string[]): Promise<void> {
  await markMediaPublic(db, mediaIds);
}

/**
 * After a commit that may have stopped referencing media (sync dropped an image,
 * post withdrawn, …): removes from the public store every candidate that is no
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
  await stores.publicStore.deleteMany(media.flatMap((m) => renditionsOf(m).map((r) => r.key)));
  const anyRef = await filterReferencedByAnyPost(db, toWithdraw);
  await markMediaWithdrawn(db, toWithdraw.filter((id) => anyRef.has(id)), false);
  await markMediaWithdrawn(db, toWithdraw.filter((id) => !anyRef.has(id)), true);
}
