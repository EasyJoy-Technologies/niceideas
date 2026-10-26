import type { Db } from "@/server/db/client";
import {
  deleteProfileCascade,
  insertDeletedAccount,
  isDeletedAccount,
  lockProfileForStatusChange,
  mediaOfOwner,
  postIdsOfAuthor,
  setProfileStatus,
  switchAuthorPosts,
} from "@/server/db/repos/accounts";
import { findMediaByIds } from "@/server/db/repos/media";
import { deletePosts } from "@/server/db/repos/maintenance";
import { findProfile } from "@/server/db/repos/profiles";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { deleteSessionsOfUser } from "@/server/db/repos/sessions";
import { mediaKeys } from "@/server/media/keys";
import { projectMediaPublic, recordMediaPublic, settlePublication, withdrawUnreferencedMedia } from "@/server/media/publication";
import { ownAvatarKey } from "@/server/profiles/avatars";
import type { MediaStores } from "@/server/storage/types";

/**
 * The three deletion steps of an account (contract docs/api/account-events.md). Each one is safe to
 * run again after a partial failure (apply-account-event.ts re-runs it on redelivery). State changes
 * hold the profile lock, so they never interleave with publishing (author-gate.ts).
 */
export type DeletionRuntime = { db: Db; stores: MediaStores; cacheControl: string };

async function currentMediaIds(db: Db, postIds: string[]): Promise<string[]> {
  const rows = postIds.length ? await db.selectFrom("post").select("current_revision_id").where("id", "in", postIds).execute() : [];
  const ids = await Promise.all(rows.map((r) => (r.current_revision_id ? listRevisionMediaIds(db, r.current_revision_id) : [])));
  return [...new Set(ids.flat())];
}

/** Cooling-off starts: profile and posts go offline at once (pages answer 410), sessions end. */
export async function startCoolingOff(rt: DeletionRuntime, userId: string): Promise<void> {
  await rt.db.transaction().execute(async (trx) => {
    if (!(await lockProfileForStatusChange(trx, userId))) return;
    await setProfileStatus(trx, userId, "deleting");
    await deleteSessionsOfUser(trx, userId);
    await switchAuthorPosts(trx, userId, "active", "author_deleting");
  });
  // All offline posts, not only the ones switched now: a redelivery finishes a withdrawal that failed.
  await withdrawUnreferencedMedia(rt.db, rt.stores, await currentMediaIds(rt.db, await postIdsOfAuthor(rt.db, userId, "author_deleting")));
}

/** Cooling-off cancelled: everything offline because of it goes back online with the same links. */
export async function cancelCoolingOff(rt: DeletionRuntime, userId: string): Promise<void> {
  const moved = await currentMediaIds(rt.db, await postIdsOfAuthor(rt.db, userId, "author_deleting"));
  await projectMediaPublic(rt.stores, await findMediaByIds(rt.db, moved), rt.cacheControl);
  const live = await rt.db.transaction().execute(async (trx) => {
    if (!(await lockProfileForStatusChange(trx, userId)) || (await isDeletedAccount(trx, userId))) return [];
    await setProfileStatus(trx, userId, "active");
    // Includes posts that first got content during the cooling-off period.
    const ids = await currentMediaIds(trx, await switchAuthorPosts(trx, userId, "author_deleting", "active"));
    await recordMediaPublic(trx, ids.filter((id) => moved.includes(id)));
    return ids;
  });
  await settlePublication(rt.db, rt.stores, rt.cacheControl, { moved, live });
}

/**
 * Cooling-off ended: deletes everything now (no extra retention), the avatar copy included. The
 * account is fenced first, so nothing new (profile, post, media) can be created for it meanwhile
 * and the media listed below are all there are.
 */
export async function completeDeletion(rt: DeletionRuntime, userId: string): Promise<void> {
  await rt.db.transaction().execute(async (trx) => {
    if (await lockProfileForStatusChange(trx, userId)) await setProfileStatus(trx, userId, "deleting");
    await insertDeletedAccount(trx, userId);
  });
  const media = await mediaOfOwner(rt.db, userId);
  const avatar = ownAvatarKey((await findProfile(rt.db, userId))?.avatar_url ?? null);
  if (avatar) await rt.stores.publicStore.deleteMany([avatar]);
  const keys = media.flatMap((m) => mediaKeys(m));
  await rt.stores.publicStore.deleteMany(keys);
  await rt.stores.privateStore.deleteMany(keys);
  await deletePosts(rt.db, await postIdsOfAuthor(rt.db, userId));
  // An avatar stored by the worker after the read above (the profile row is gone after this).
  const lastAvatar = ownAvatarKey(await deleteProfileCascade(rt.db, userId, media.map((m) => m.id)));
  if (lastAvatar && lastAvatar !== avatar) await rt.stores.publicStore.deleteMany([lastAvatar]);
}
