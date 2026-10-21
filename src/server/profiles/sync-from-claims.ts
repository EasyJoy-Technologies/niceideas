import type { JWTPayload } from "jose";
import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { isUniqueViolation } from "@/server/db/repos/profiles";
import { HANDLE_PATTERN, isValidHandle, RESERVED_HANDLES } from "./handles";

const MAX_NAME = 50;

function claimString(claims: JWTPayload, key: string): string {
  const v = claims[key];
  return typeof v === "string" ? v.trim() : "";
}

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

/**
 * Web sign-in (plan §3): the handle follows the NiceMatrix username (re-synced at every
 * sign-in; users without a usable username keep their generated handle). An empty
 * display name / avatar is filled from the ID token; values set on NiceIdeas are kept.
 */
export async function syncProfileFromClaims(db: Db, profile: Profile, claims: JWTPayload): Promise<Profile> {
  const patch: { display_name?: string; avatar_url?: string; handle?: string } = {};
  const username = claimString(claims, "username");
  const handle = handleFromUsername(username);
  if (handle && handle !== profile.handle) patch.handle = handle;
  // Diagnostics only (no personal data): why the handle did or did not follow the username.
  const outcome = !username ? "no_username" : !handle ? "unusable" : patch.handle ? "updated" : "unchanged";
  console.info(JSON.stringify({ event: "handle_sync", result: outcome, ...(outcome === "unusable" ? { reason: unusableReason(username) } : {}) }));
  if (!profile.display_name) {
    const name = claimString(claims, "name") || claimString(claims, "nickname") || claimString(claims, "username");
    if (name) patch.display_name = Array.from(name).slice(0, MAX_NAME).join("");
  }
  if (!profile.avatar_url) {
    const picture = claimString(claims, "picture");
    if (/^https:\/\/[^\s"'<>]{1,500}$/.test(picture)) patch.avatar_url = picture;
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
