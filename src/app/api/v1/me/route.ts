import { authenticateFirstParty } from "@/server/auth/authenticate";
import { getDb } from "@/server/db";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { toProfileDto } from "@/server/profiles/profile-dto";

/** Current caller's profile (created on first call). */
export const GET = apiRoute("me.get", async (request) => {
  const principal = await authenticateFirstParty(request);
  const profile = await ensureProfile(getDb(), principal.userId);
  return jsonOk({ profile: toProfileDto(profile) });
});
