import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { isUniqueViolation } from "@/server/db/repos/profiles";
import { HANDLE_PATTERN, handleFromUserId, isGeneratedHandle, isValidHandle, RESERVED_HANDLES } from "./handles";

/**
 * Profile data from NiceMatrix (web sign-in ID token, share request, profile_updated event).
 * A field left `undefined` is unknown (unchanged); `null` means NiceMatrix has no value.
 */
export type NiceMatrixProfile = { username?: string | null; name?: string | null; avatarUrl?: string | null };

const MAX_NAME = 50;
const AVATAR_URL = /^https:\/\/[^\s"'<>]{1,500}$/;

/** NiceMatrix (Logto) username → handle; null when it cannot be one (missing, too long, other characters, reserved). */
export function handleFromUsername(username: string): string | null {
  const h = username.toLowerCase();
  return isValidHandle(h) ? h : null;
}

/** Why a username cannot be a handle (category only, never the value). */
function unusableReason(username: string): string {
  const h = username.toLowerCase();
  if (h.length > 64) return "too_long";
  if (!HANDLE_PATTERN.test(h)) return "characters";
  return RESERVED_HANDLES.has(h) ? "reserved" : "other";
}

function handlePatch(profile: Profile, username: string | null | undefined): string | undefined {
  if (username === undefined) return undefined;
  // No username → a random handle becomes the user id (a handle that came from a username is kept, so a missing value never breaks links).
  const handle = username ? handleFromUsername(username) : isGeneratedHandle(profile.handle) ? handleFromUserId(profile.user_id) : null;
  const patch = handle && handle !== profile.handle ? handle : undefined;
  const outcome = !username ? (patch ? "user_id" : "no_username") : !handle ? "unusable" : patch ? "updated" : "unchanged";
  // Diagnostics only (no personal data): why the handle did or did not follow the username.
  console.info(JSON.stringify({ event: "handle_sync", result: outcome, ...(outcome === "unusable" ? { reason: unusableReason(username!) } : {}) }));
  return patch;
}

/**
 * Applies NiceMatrix profile data (plan docs/plan/2026-10-23-nicenote-source-api.md §6):
 * the handle always follows the NiceMatrix username (unusable / taken → current handle kept);
 * the display name follows unless it was changed on NiceIdeas (`name_locked`); the avatar always
 * follows (it cannot be changed on NiceIdeas). Nothing is written back to NiceMatrix.
 */
export async function followNiceMatrixProfile(db: Db, profile: Profile, nm: NiceMatrixProfile): Promise<Profile> {
  const patch: { display_name?: string; avatar_url?: string | null; handle?: string } = {};
  const handle = handlePatch(profile, nm.username);
  if (handle) patch.handle = handle;
  if (!profile.name_locked && nm.name !== undefined) {
    const name = Array.from((nm.name ?? "").replace(/\s+/g, " ").trim()).slice(0, MAX_NAME).join("");
    if (name !== profile.display_name) patch.display_name = name;
  }
  if (nm.avatarUrl !== undefined) {
    const avatar = nm.avatarUrl === null ? null : AVATAR_URL.test(nm.avatarUrl) ? nm.avatarUrl : profile.avatar_url;
    if (avatar !== profile.avatar_url) patch.avatar_url = avatar;
  }
  if (Object.keys(patch).length === 0) return profile;
  const save = (p: typeof patch) =>
    db.updateTable("profile").set({ ...p, updated_at: new Date() }).where("user_id", "=", profile.user_id).returningAll().executeTakeFirstOrThrow();
  try {
    return await save(patch);
  } catch (err) {
    if (!patch.handle || !isUniqueViolation(err, "profile_handle_key")) throw err;
    // Another profile still holds the handle (an older generated or renamed one): keep ours for now.
    console.warn(JSON.stringify({ event: "handle_sync", result: "taken" }));
    const { handle: _taken, ...rest } = patch;
    void _taken;
    return Object.keys(rest).length ? save(rest) : profile;
  }
}
