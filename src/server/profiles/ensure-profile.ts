import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { accountDeleting } from "@/server/accounts/author-gate";
import { isDeletedAccount } from "@/server/db/repos/accounts";
import { enqueueOutbox } from "@/server/db/repos/outbox";
import { findProfile, insertProfileIfAbsent } from "@/server/db/repos/profiles";
import { generateHandle, handleFromUserId } from "./handles";

const MAX_ATTEMPTS = 5;

/**
 * Returns the caller's platform profile, creating it on first contact (plan §3).
 * The first handle is the NiceMatrix user id (random only if that id cannot be a
 * handle or is taken); the web sign-in then switches it to the NiceMatrix username.
 * Display name / avatar follow NiceMatrix (profile-follow.ts). A new profile is registered with
 * the NiceMatrix backend (contract niceideas-share.md §4.1) so later profile changes are pushed here.
 * A user whose deletion completed (or is running) gets 409 `user.deleting` and no new profile.
 */
export async function ensureProfile(db: Db, userId: string): Promise<Profile> {
  if (await isDeletedAccount(db, userId)) throw accountDeleting();
  const existing = await findProfile(db, userId);
  if (existing) return existing;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const handle = (attempt === 0 && handleFromUserId(userId)) || generateHandle();
    // The profile and its registration with the backend are written together (F19).
    const row = await db.transaction().execute(async (trx) => {
      const inserted = await insertProfileIfAbsent(trx, { user_id: userId, handle, display_name: "", bio: "" });
      if (inserted) await enqueueOutbox(trx, { kind: "user_registered", dedupeKey: `user_registered:${userId}`, payload: { userId } });
      return inserted;
    });
    if (row) return row;
    // Not inserted: created concurrently, deleted for good, or the handle is taken (next attempt).
    const raced = await findProfile(db, userId);
    if (raced) return raced;
    if (await isDeletedAccount(db, userId)) throw accountDeleting();
  }
  throw new Error("could not allocate a unique handle");
}
