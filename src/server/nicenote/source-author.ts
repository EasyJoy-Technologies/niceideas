import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { accountDeleting } from "@/server/accounts/author-gate";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { followNiceMatrixProfile, type NiceMatrixProfile } from "@/server/profiles/profile-follow";

/**
 * The user a source-API call acts for (contract niceideas-share.md §3.2, §10.2): the profile is created
 * on first contact (and registered with the backend, §4.1), then follows the sent NiceMatrix data (§5).
 * An account being deleted (or deleted) → 409 `user.deleting`. Callers re-check under `assertAuthorActive`.
 */
export async function prepareSourceAuthor(db: Db, userId: string, profile: NiceMatrixProfile | null): Promise<Profile> {
  const found = await ensureProfile(db, userId);
  if (found.status !== "active") throw accountDeleting();
  return profile ? followNiceMatrixProfile(db, found, profile) : found;
}
