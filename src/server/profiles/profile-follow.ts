import { sql } from "kysely";
import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { queueAvatarJob } from "@/server/db/repos/avatar-jobs";
import { HANDLE_PATTERN, handleFromUserId, isGeneratedHandle, isValidHandle, RESERVED_HANDLES } from "./handles";

/**
 * Profile data from NiceMatrix (web sign-in ID token, share request, profile_updated event).
 * A field left `undefined` is unknown (unchanged); `null` means NiceMatrix has no value.
 */
export type NiceMatrixProfile = { username?: string | null; name?: string | null; avatarUrl?: string | null };

type FollowPatch = { display_name?: string; avatar_source?: string | null; handle?: string };

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
 * follows (it cannot be changed on NiceIdeas): a new source is downloaded into our bucket by the
 * worker. Nothing is written back to NiceMatrix.
 */
export async function followNiceMatrixProfile(db: Db, profile: Profile, nm: NiceMatrixProfile): Promise<Profile> {
  const patch: FollowPatch = {};
  const handle = handlePatch(profile, nm.username);
  if (handle) patch.handle = handle;
  if (!profile.name_locked && nm.name !== undefined) {
    const name = Array.from((nm.name ?? "").replace(/\s+/g, " ").trim()).slice(0, MAX_NAME).join("");
    if (name !== profile.display_name) patch.display_name = name;
  }
  if (nm.avatarUrl !== undefined) {
    const source = nm.avatarUrl === null ? null : AVATAR_URL.test(nm.avatarUrl) ? nm.avatarUrl : profile.avatar_source;
    if (source !== profile.avatar_source) patch.avatar_source = source;
  }
  if (Object.keys(patch).length === 0) return profile;
  // The change and its avatar job are written together (F19).
  return db.transaction().execute(async (trx) => {
    const saved = await savePatch(trx, profile, patch);
    // The worker downloads the new avatar (or removes ours, source ""); the current one shows until then.
    if (patch.avatar_source !== undefined) await queueAvatarJob(trx, profile.user_id, patch.avatar_source ?? "");
    return saved;
  });
}

/** Saves the patch; a handle held by another profile (an older generated or renamed one) is skipped for now. */
async function savePatch(db: Db, profile: Profile, patch: FollowPatch): Promise<Profile> {
  const { handle, ...rest } = patch;
  const saved = await db
    .updateTable("profile")
    .set({
      ...rest,
      ...(handle
        ? { handle: sql<string>`CASE WHEN EXISTS (SELECT 1 FROM profile o WHERE o.handle = ${handle} AND o.user_id <> ${profile.user_id}) THEN profile.handle ELSE ${handle} END` }
        : {}),
      updated_at: new Date(),
    })
    .where("user_id", "=", profile.user_id)
    .returningAll()
    .executeTakeFirstOrThrow();
  if (handle && saved.handle !== handle) console.warn(JSON.stringify({ event: "handle_sync", result: "taken" }));
  return saved;
}
