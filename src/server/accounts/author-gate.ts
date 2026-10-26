import type { Db } from "@/server/db/client";
import { isDeletedAccount, lockProfileShared } from "@/server/db/repos/accounts";
import { findProfile } from "@/server/db/repos/profiles";
import { ApiError } from "@/server/http/errors";

/**
 * Account state as seen by everything that publishes for a user (plan
 * docs/plan/2026-10-26-share-review-fixes.md §1): `deleting` = cooling-off (content is kept but stays
 * offline), `gone` = deletion completed or running (nothing is created any more).
 *
 * Lock order: profile first, then post. Deletion events lock the profile exclusively
 * (`lockProfileForStatusChange`), publishers share-lock it with `lockAuthor` before `lockPost`,
 * so a status change and a publish never interleave.
 */
export type AuthorState = "active" | "deleting" | "gone";

/** 409 `user.deleting` (contract niceideas-share.md; existing code, no new client-visible state). */
export const accountDeleting = () => new ApiError("user.deleting", 409);

/** Share-locks the author's profile for the rest of the transaction and returns its state. */
export async function lockAuthor(trx: Db, userId: string): Promise<AuthorState> {
  const profile = await lockProfileShared(trx, userId);
  if (!profile) return "gone";
  // A separate statement: it sees a deletion committed while this one waited for the lock.
  if (await isDeletedAccount(trx, userId)) return "gone";
  return profile.status;
}

/** Like `lockAuthor`, refusing anything but an active account. */
export async function assertAuthorActive(trx: Db, userId: string): Promise<void> {
  if ((await lockAuthor(trx, userId)) !== "active") throw accountDeleting();
}

/** Unlocked read (to skip work that would be refused); decisions are re-made under `lockAuthor`. */
export async function readAuthorState(db: Db, userId: string): Promise<AuthorState> {
  const profile = await findProfile(db, userId);
  if (!profile || (await isDeletedAccount(db, userId))) return "gone";
  return profile.status;
}
