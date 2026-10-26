import type { Db } from "@/server/db/client";
import type { Media } from "@/server/db/schema";
import { markMediaPublic } from "@/server/db/repos/media";
import { leaseVisibility, releaseVisibilityLease, requestVisibilityCheck } from "@/server/db/repos/media-visibility";
import { moveObject } from "@/server/storage/move";
import { renditionsOf } from "./keys";
import { checkMediaVisibility, type VisibilityRuntime } from "./visibility";

/**
 * Publication of media in the public store (plan §16, S2 F06). Publishing moves the objects BEFORE
 * the commit that makes a post use them (no broken images), under a lease that keeps visibility
 * checks away; `finishPublication` ends the lease after the commit (or failure) and checks
 * everything touched, so media that did not go live go back at once. A crash in between leaves the
 * media due when the lease runs out: the worker checks them then.
 * Taking media offline: `requestVisibilityCheck` in the transaction, `checkMediaVisibility` after it.
 */
export type Projection = { media: string[]; owned: string[]; until: Date };

/** Lease, after which a check takes back media moved for a publish that never committed. */
const LEASE_SECONDS = 120;

export async function projectMediaPublic(rt: VisibilityRuntime, media: Media[]): Promise<Projection> {
  const ids = media.map((m) => m.id);
  const lease = await leaseVisibility(rt.db, ids, LEASE_SECONDS);
  for (const m of media) {
    for (const r of renditionsOf(m)) await moveObject(rt.stores.privateStore, rt.stores.publicStore, r.key, { contentType: r.mime, cacheControl: rt.cacheControl });
  }
  return { media: ids, ...lease };
}

/** No media moved (the post will not be live). */
export const NO_PROJECTION: Projection = { media: [], owned: [], until: new Date(0) };

/**
 * In the publishing transaction: records the live media as public (the moved ones) and marks the
 * others among `live` and the `dropped` ones for a check. Returns every id to check after the commit.
 */
export async function recordPublication(trx: Db, p: Projection, live: string[], dropped: string[] = []): Promise<string[]> {
  const moved = new Set(p.media);
  await markMediaPublic(trx, live.filter((id) => moved.has(id)));
  await requestVisibilityCheck(trx, [...live.filter((id) => !moved.has(id)), ...dropped]);
  return [...live, ...dropped];
}

/** After the commit or failure: ends the lease and checks the moved and touched media now. Never throws. */
export async function finishPublication(rt: VisibilityRuntime, p: Projection, touched: string[] = []): Promise<void> {
  await releaseVisibilityLease(rt.db, p.owned, p.until).catch((e) => console.error("[media] lease release failed", e));
  await checkMediaVisibility(rt, [...p.media, ...touched]);
}

/** Marks media for a check in the transaction that may have stopped using them. */
export async function queueVisibilityCheck(trx: Db, ids: string[]): Promise<void> {
  await requestVisibilityCheck(trx, ids);
}
