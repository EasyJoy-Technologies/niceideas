import type { JWTPayload } from "jose";
import type { PostSource } from "@/server/db/schema";
import { unauthorized, forbidden } from "@/server/http/errors";
import type { FirstPartyPolicy } from "./first-party";

/** Authenticated caller of the API. */
export type Principal = {
  userId: string;
  clientId: string;
  kind: "first_party" | "third_party";
  /** Publication source implied by the token audience (third party: `api:<key>`). */
  source: PostSource;
  /** Registered third-party client (third party only). */
  apiClientId?: string;
};

/**
 * Classifies verified claims (signature, issuer, expiry already checked).
 * First-party = audience is a NiceNote business audience AND client_id is allow-listed.
 * Third-party tokens (audience https://api.niceideas.app) arrive in phase 3.
 */
export function toPrincipal(claims: JWTPayload, policy: FirstPartyPolicy): Principal {
  const userId = typeof claims.sub === "string" ? claims.sub : "";
  const clientId = typeof claims.client_id === "string" ? claims.client_id : "";
  if (!userId || !clientId) throw unauthorized("auth.invalid_token");

  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  const sources = new Set(audiences.map((a) => policy.audiences.get(a)).filter((s): s is PostSource => !!s));
  if (sources.size !== 1) throw unauthorized("auth.audience_not_accepted");
  if (!policy.clientIds.has(clientId)) throw forbidden("auth.client_not_allowed");

  return { userId, clientId, kind: "first_party", source: [...sources][0] };
}
