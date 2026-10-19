import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { findProfile, insertProfileIfAbsent } from "@/server/db/repos/profiles";
import { generateHandle } from "./handles";

const MAX_ATTEMPTS = 5;

/**
 * Returns the caller's platform profile, creating it on first contact
 * (plan §3). Display name / avatar are filled from Logto userinfo at the
 * first web sign-in (phase 2); API-first users start with an empty name.
 */
export async function ensureProfile(db: Db, userId: string): Promise<Profile> {
  const existing = await findProfile(db, userId);
  if (existing) return existing;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await insertProfileIfAbsent(db, { user_id: userId, handle: generateHandle(), display_name: "", bio: "" });
    if (row) return row;
  }
  throw new Error("could not allocate a unique handle");
}
