import { getConfig } from "@/server/config/env";
import type { Profile } from "@/server/db/schema";

/** Platform moderators: NiceMatrix user ids listed in ADMIN_USER_IDS (empty = nobody). */
export function isAdmin(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return getConfig()
    .ADMIN_USER_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(profile.user_id);
}
