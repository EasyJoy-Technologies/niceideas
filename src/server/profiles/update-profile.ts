import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";

export const NAME_MAX = 50;
export const BIO_MAX = 300;

/** The handle is not editable here: it follows the NiceMatrix username (sync-from-claims.ts). */
export type ProfileEdit = { displayName: string; bio: string };
export type ProfileEditError = "too_long";

const chars = (s: string) => Array.from(s).length;

/** Validates and saves the user's own name and bio. */
export async function updateOwnProfile(db: Db, profile: Profile, edit: ProfileEdit): Promise<{ ok: true; profile: Profile } | { ok: false; error: ProfileEditError }> {
  const displayName = edit.displayName.replace(/\s+/g, " ").trim();
  const bio = edit.bio.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (chars(displayName) > NAME_MAX || chars(bio) > BIO_MAX) return { ok: false, error: "too_long" };
  const row = await db
    .updateTable("profile")
    .set({ display_name: displayName, bio, updated_at: new Date() })
    .where("user_id", "=", profile.user_id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { ok: true, profile: row };
}
