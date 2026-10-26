import { queueMediaPurge, queuePostPurge } from "@/server/cdn/purge-queue";
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
import { uploadsOfOwner } from "@/server/db/repos/media-uploads";
import { deletePosts } from "@/server/db/repos/maintenance";
import { findProfile } from "@/server/db/repos/profiles";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { deleteSessionsOfUser } from "@/server/db/repos/sessions";
import { mediaKeys } from "@/server/media/keys";
import { finishPublication, projectMediaPublic, queueVisibilityCheck, recordPublication } from "@/server/media/publication";
import { checkMediaVisibility } from "@/server/media/visibility";
import { ownAvatarKey } from "@/server/profiles/avatars";
import type { MediaStores } from "@/server/storage/types";

/**
 * The three deletion steps of an account (contract docs/api/account-events.md). Each one is safe to
 * run again after a partial failure (apply-account-event.ts re-runs it on redelivery). State changes
 * hold the profile lock, so they never interleave with publishing (author-gate.ts).
 */
export type DeletionRuntime = { db: Db; stores: MediaStores; cacheControl: string };

/** Media of the posts' current revisions (`publicOnly`: of their public posts only — private ones stay private). */
async function currentMediaIds(db: Db, postIds: string[], publicOnly = false): Promise<string[]> {
  const q = db.selectFrom("post").select("current_revision_id").where("id", "in", postIds);
  const rows = postIds.length ? await (publicOnly ? q.where("visibility", "=", "public") : q).execute() : [];
  const ids = await Promise.all(rows.map((r) => (r.current_revision_id ? listRevisionMediaIds(db, r.current_revision_id) : [])));
  return [...new Set(ids.flat())];
}

async function slugsOf(db: Db, postIds: string[]): Promise<string[]> {
  return postIds.length ? (await db.selectFrom("post").select("slug").where("id", "in", postIds).execute()).map((r) => r.slug) : [];
}

/** Cooling-off starts: profile and posts go offline at once (pages answer 410), sessions end. */
export async function startCoolingOff(rt: DeletionRuntime, userId: string): Promise<void> {
  const media = await rt.db.transaction().execute(async (trx) => {
    if (!(await lockProfileForStatusChange(trx, userId))) return [];
    await setProfileStatus(trx, userId, "deleting");
    await deleteSessionsOfUser(trx, userId);
    const offline = await switchAuthorPosts(trx, userId, "active", "author_deleting");
    await queuePostPurge(trx, await slugsOf(trx, offline));
    // All offline posts, not only the ones switched now: a redelivery finishes a withdrawal that failed.
    const ids = await currentMediaIds(trx, await postIdsOfAuthor(trx, userId, "author_deleting"));
    await queueVisibilityCheck(trx, ids);
    return ids;
  });
  await checkMediaVisibility(rt, media);
}

/** Cooling-off cancelled: everything offline because of it goes back online with the same links. */
export async function cancelCoolingOff(rt: DeletionRuntime, userId: string): Promise<void> {
  const before = await currentMediaIds(rt.db, await postIdsOfAuthor(rt.db, userId, "author_deleting"), true);
  const projection = await projectMediaPublic(rt, await findMediaByIds(rt.db, before));
  let touched: string[] = [];
  try {
    await rt.db.transaction().execute(async (trx) => {
      if (!(await lockProfileForStatusChange(trx, userId)) || (await isDeletedAccount(trx, userId))) return;
      await setProfileStatus(trx, userId, "active");
      // Includes posts that first got content during the cooling-off period.
      touched = await recordPublication(trx, projection, await currentMediaIds(trx, await switchAuthorPosts(trx, userId, "author_deleting", "active"), true));
    });
  } finally {
    await finishPublication(rt, projection, touched);
  }
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
  // Edge copies of everything that was public (share cards included) are purged as well (F22).
  await queueMediaPurge(rt.db, media.filter((m) => m.public_at));
  await queuePostPurge(rt.db, await slugsOf(rt.db, await postIdsOfAuthor(rt.db, userId)));
  const avatar = ownAvatarKey((await findProfile(rt.db, userId))?.avatar_url ?? null);
  if (avatar) await rt.stores.publicStore.deleteMany([avatar]);
  const keys = media.flatMap((m) => mediaKeys(m));
  await rt.stores.publicStore.deleteMany(keys);
  await rt.stores.privateStore.deleteMany(keys);
  // Objects of uploads that never got their media row (their records go with the profile).
  for (const prefix of await uploadsOfOwner(rt.db, userId)) await rt.stores.privateStore.deleteMany(await rt.stores.privateStore.listKeys(`${prefix}/`));
  await deletePosts(rt.db, await postIdsOfAuthor(rt.db, userId));
  // An avatar stored by the worker after the read above (the profile row is gone after this).
  const lastAvatar = ownAvatarKey(await deleteProfileCascade(rt.db, userId, media.map((m) => m.id)));
  if (lastAvatar && lastAvatar !== avatar) await rt.stores.publicStore.deleteMany([lastAvatar]);
}
