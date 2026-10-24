import type { JWTPayload } from "jose";
import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { followNiceMatrixProfile } from "./profile-follow";

function claimString(claims: JWTPayload, key: string): string {
  const v = claims[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Web sign-in (plan §3): applies the ID token with the shared follow rules (profile-follow.ts).
 * A missing name / picture claim leaves the current value; a missing username means "none".
 */
export async function syncProfileFromClaims(db: Db, profile: Profile, claims: JWTPayload): Promise<Profile> {
  return followNiceMatrixProfile(db, profile, {
    username: claimString(claims, "username") || null,
    name: claimString(claims, "name") || claimString(claims, "nickname") || undefined,
    avatarUrl: claimString(claims, "picture") || undefined,
  });
}
