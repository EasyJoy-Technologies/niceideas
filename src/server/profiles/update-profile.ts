import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { findProfileByHandle, isUniqueViolation } from "@/server/db/repos/profiles";
import { isValidHandle } from "./handles";

export const NAME_MAX = 50;
export const BIO_MAX = 300;

export type ProfileEdit = { displayName: string; handle: string; bio: string };
export type ProfileEditError = "handle_invalid" | "handle_taken" | "too_long";

const chars = (s: string) => Array.from(s).length;

/** Validates and saves the user's own name, handle and bio. */
export async function updateOwnProfile(db: Db, profile: Profile, edit: ProfileEdit): Promise<{ ok: true; profile: Profile } | { ok: false; error: ProfileEditError }> {
  const displayName = edit.displayName.replace(/\s+/g, " ").trim();
  const bio = edit.bio.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const handle = edit.handle.trim().replace(/^@/, "").toLowerCase();
  if (chars(displayName) > NAME_MAX || chars(bio) > BIO_MAX) return { ok: false, error: "too_long" };
  if (handle !== profile.handle) {
    if (!isValidHandle(handle)) return { ok: false, error: "handle_invalid" };
    if (await findProfileByHandle(db, handle)) return { ok: false, error: "handle_taken" };
  }
  try {
    const row = await db
      .updateTable("profile")
      .set({ display_name: displayName, handle, bio, updated_at: new Date() })
      .where("user_id", "=", profile.user_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { ok: true, profile: row };
  } catch (err) {
    if (isUniqueViolation(err, "profile_handle_key")) return { ok: false, error: "handle_taken" };
    throw err;
  }
}
