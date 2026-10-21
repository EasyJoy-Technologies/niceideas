import type { JWTPayload } from "jose";
import type { Db } from "@/server/db/client";
import { findActiveApiClient } from "@/server/db/repos/api-clients";
import { forbidden, unauthorized } from "@/server/http/errors";
import type { Principal } from "./principal";

/** Scopes of the third-party API resource (plan §9). */
export const API_SCOPES = ["posts:read", "posts:write", "media:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Third-party caller (audience = third-party API resource): the Logto client must be
 * registered and active in `api_client`; its posts carry source `api:<source_key>`.
 */
export async function toThirdPartyPrincipal(db: Db, claims: JWTPayload, scope: ApiScope): Promise<Principal> {
  const userId = typeof claims.sub === "string" ? claims.sub : "";
  const clientId = typeof claims.client_id === "string" ? claims.client_id : "";
  if (!userId || !clientId) throw unauthorized("auth.invalid_token");
  const client = await findActiveApiClient(db, clientId);
  if (!client) throw forbidden("auth.client_not_allowed");
  const scopes = new Set(typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : []);
  if (!scopes.has(scope)) throw forbidden("auth.insufficient_scope");
  return { userId, clientId, kind: "third_party", source: `api:${client.source_key}`, apiClientId: client.id };
}
