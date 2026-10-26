import type { Db } from "@/server/db/client";
import type { Media } from "@/server/db/schema";
import { deferVisibility, listDueVisibility, lockDueMedia, mediaReferences, settleVisibility } from "@/server/db/repos/media-visibility";
import { moveObject } from "@/server/storage/move";
import type { MediaStores } from "@/server/storage/types";
import { renditionsOf } from "./keys";

/**
 * Brings media objects in line with their references (plan docs/plan/2026-10-26-share-review-fixes.md
 * S2, F06): used by the current revision of an active post of an active author → public store,
 * otherwise private store. Every state change marks the media due in its own transaction
 * (`requestVisibilityCheck`); the check runs right after the commit in the request and again in the
 * worker for anything left due (failure, crash). A check holds the media row lock while it moves the
 * objects, and publishing moves happen under a lease the check stays away from, so two moves of
 * one media never run against each other.
 */
export type VisibilityRuntime = { db: Db; stores: MediaStores; cacheControl: string };

const RETRY_SECONDS = 300;
const BATCH = 20;

async function moveAll(rt: VisibilityRuntime, media: Media, toPublic: boolean): Promise<void> {
  const [from, to] = toPublic ? [rt.stores.privateStore, rt.stores.publicStore] : [rt.stores.publicStore, rt.stores.privateStore];
  for (const r of renditionsOf(media)) await moveObject(from, to, r.key, { contentType: r.mime, cacheControl: toPublic ? rt.cacheControl : undefined });
}

/** Checks one media if due; false when it was not (not due, being checked, deleted). */
async function checkOne(rt: VisibilityRuntime, id: string): Promise<boolean> {
  try {
    return await rt.db.transaction().execute(async (trx) => {
      const media = await lockDueMedia(trx, id);
      if (!media) return false;
      const refs = await mediaReferences(trx, id);
      await moveAll(rt, media, refs.live);
      await settleVisibility(trx, id, refs);
      return true;
    });
  } catch (err) {
    console.error(JSON.stringify({ event: "media_visibility", mediaId: id, result: "retry", error: err instanceof Error ? err.message : String(err) }));
    await deferVisibility(rt.db, id, RETRY_SECONDS).catch(() => undefined);
    return false;
  }
}

/** Checks the given media now (after a commit); anything failing stays due for the worker. Never throws. */
export async function checkMediaVisibility(rt: VisibilityRuntime, ids: string[]): Promise<void> {
  for (const id of new Set(ids)) await checkOne(rt, id);
}

/** Worker: checks the media due now; false when none was due. */
export async function runVisibilityChecks(rt: VisibilityRuntime): Promise<boolean> {
  let worked = false;
  for (const id of await listDueVisibility(rt.db, BATCH)) if (await checkOne(rt, id)) worked = true;
  return worked;
}
