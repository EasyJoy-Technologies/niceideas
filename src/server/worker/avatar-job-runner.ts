import type { Db } from "@/server/db/client";
import { claimAvatarJob, settleAvatarJob, type AvatarJob } from "@/server/db/repos/avatar-jobs";
import { findProfile } from "@/server/db/repos/profiles";
import { fetchPublicHttps, PublicFetchError, type PublicFetchResult } from "@/server/http/public-https";
import { AVATAR_CACHE_CONTROL, avatarUrlOf, avatarWebp, newAvatarKey, ownAvatarKey } from "@/server/profiles/avatars";
import type { ObjectStore } from "@/server/storage/types";
import { errorText, retryDelaySeconds, withinRetryWindow } from "./retry";

export type AvatarWorkerRuntime = { db: Db; publicStore: ObjectStore; download?: (url: string) => Promise<PublicFetchResult> };

const LEASE_SECONDS = 120;
const MAX_BYTES = 10 * 1024 * 1024;
const download = (url: string) => fetchPublicHttps(url, { maxBytes: MAX_BYTES, timeoutMs: 15_000 });

/** Points the profile at `url` if it still follows `source`; true when it did. */
async function setAvatar(db: Db, userId: string, source: string | null, url: string | null): Promise<boolean> {
  const q = db.updateTable("profile").set({ avatar_url: url, updated_at: new Date() }).where("user_id", "=", userId);
  const r = await (source === null ? q.where("avatar_source", "is", null) : q.where("avatar_source", "=", source)).executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0) > 0;
}

/**
 * One avatar job: downloads the NiceMatrix avatar (public https only, ≤ 10 MB), stores a 256 px
 * WebP in the public bucket and points the profile at it, then deletes the previous own avatar.
 * Source "" = the avatar was removed. A failed download keeps the current avatar (temporary problems
 * are retried for 24 hours). A job overtaken by a newer source does nothing.
 */
async function runAvatarJob(rt: AvatarWorkerRuntime, job: AvatarJob): Promise<string> {
  const profile = await findProfile(rt.db, job.user_id);
  const source = job.source_url || null;
  if (!profile || profile.avatar_source !== source) return "stale";
  const old = ownAvatarKey(profile.avatar_url);
  if (source === null) {
    if (await setAvatar(rt.db, job.user_id, null, null)) await rt.publicStore.deleteMany(old ? [old] : []);
    return "cleared";
  }
  const file = await (rt.download ?? download)(source);
  let webp: Buffer;
  try {
    webp = await avatarWebp(file.body);
  } catch {
    throw new PublicFetchError("not an image", true);
  }
  const key = newAvatarKey();
  await rt.publicStore.putBuffer(key, webp, { contentType: "image/webp", cacheControl: AVATAR_CACHE_CONTROL });
  if (!(await setAvatar(rt.db, job.user_id, source, avatarUrlOf(key)))) {
    await rt.publicStore.deleteMany([key]);
    return "stale";
  }
  if (old) await rt.publicStore.deleteMany([old]);
  return "stored";
}

/** Takes the next due avatar job; false when none was due. */
export async function runNextAvatarJob(rt: AvatarWorkerRuntime): Promise<boolean> {
  const job = await claimAvatarJob(rt.db, LEASE_SECONDS);
  if (!job) return false;
  let result: string;
  try {
    result = await runAvatarJob(rt, job);
    await settleAvatarJob(rt.db, job, { state: "done" });
  } catch (err) {
    const permanent = err instanceof PublicFetchError && err.permanent;
    const error = errorText(err);
    const retry = !permanent && withinRetryWindow(job.created_at);
    await settleAvatarJob(rt.db, job, retry ? { retryInSeconds: retryDelaySeconds(job.attempts), error } : { state: "failed", error });
    result = retry ? "retry" : "failed";
  }
  console.log(JSON.stringify({ event: "avatar_job", attempt: job.attempts, result }));
  return true;
}
