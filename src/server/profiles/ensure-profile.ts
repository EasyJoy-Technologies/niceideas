import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { findProfile, insertProfileIfAbsent } from "@/server/db/repos/profiles";
import { generateHandle, handleFromUserId } from "./handles";

const MAX_ATTEMPTS = 5;

/**
 * Returns the caller's platform profile, creating it on first contact (plan §3).
 * The first handle is the NiceMatrix user id (random only if that id cannot be a
 * handle or is taken); the web sign-in then switches it to the NiceMatrix username.
 * Display name / avatar are filled at the first web sign-in; API-first users start without a name.
 */
export async function ensureProfile(db: Db, userId: string): Promise<Profile> {
  const existing = await findProfile(db, userId);
  if (existing) return existing;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await insertProfileIfAbsent(db, { user_id: userId, handle: (attempt === 0 && handleFromUserId(userId)) || generateHandle(), display_name: "", bio: "" });
    if (row) return row;
  }
  throw new Error("could not allocate a unique handle");
}
