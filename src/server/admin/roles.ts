import type { Db } from "@/server/db/client";
import type { AdminRole, Profile } from "@/server/db/schema";
import { isAdmin } from "./admins";

/**
 * Admin console role of a profile: bootstrap owners (ADMIN_USER_IDS) are always "admin";
 * others come from `admin_member` (managed in the console, phase A3). null = no access.
 */
export async function adminRoleOf(db: Db, profile: Profile | null | undefined): Promise<AdminRole | null> {
  if (!profile) return null;
  if (isAdmin(profile)) return "admin";
  const row = await db.selectFrom("admin_member").select("role").where("user_id", "=", profile.user_id).executeTakeFirst();
  return row?.role ?? null;
}

/** Moderation actions (take down, restore, ban, dismiss): admins and moderators. */
export const canModerate = (role: AdminRole | null | undefined): boolean => role === "admin" || role === "moderator";
