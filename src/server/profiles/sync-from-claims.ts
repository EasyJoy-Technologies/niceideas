import type { JWTPayload } from "jose";
import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";

const MAX_NAME = 50;

function claimString(claims: JWTPayload, key: string): string {
  const v = claims[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Fills an empty display name / avatar from the NiceMatrix ID token at web
 * sign-in (plan §3). Values the user already has on NiceIdeas are never overwritten.
 */
export async function syncProfileFromClaims(db: Db, profile: Profile, claims: JWTPayload): Promise<Profile> {
  const patch: { display_name?: string; avatar_url?: string } = {};
  if (!profile.display_name) {
    const name = claimString(claims, "name") || claimString(claims, "nickname") || claimString(claims, "username");
    if (name) patch.display_name = Array.from(name).slice(0, MAX_NAME).join("");
  }
  if (!profile.avatar_url) {
    const picture = claimString(claims, "picture");
    if (/^https:\/\/[^\s"'<>]{1,500}$/.test(picture)) patch.avatar_url = picture;
  }
  if (Object.keys(patch).length === 0) return profile;
  return db.updateTable("profile").set({ ...patch, updated_at: new Date() }).where("user_id", "=", profile.user_id).returningAll().executeTakeFirstOrThrow();
}
