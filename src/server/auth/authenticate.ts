import { errors } from "jose";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { unauthorized } from "@/server/http/errors";
import type { Principal } from "./principal";
import { toThirdPartyPrincipal, type ApiScope } from "./third-party";
import { createTokenVerifier, remoteKeys, type TokenVerifier } from "./token-verifier";

type AuthContext = { verify: TokenVerifier };
let context: AuthContext | null = null;

function getContext(): AuthContext {
  if (!context) {
    const cfg = getConfig();
    context = { verify: createTokenVerifier(cfg.LOGTO_ISSUER, remoteKeys(cfg.LOGTO_JWKS_URI)) };
  }
  return context;
}

/** Test hook: inject a verifier. */
export function setAuthContextForTests(next: AuthContext | null): void {
  context = next;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Caller of the public API (plan §9): a registered third-party app with the endpoint's scope.
 * NiceNote no longer calls this API (it shares through the NiceMatrix backend, contract
 * niceideas-share.md): tokens for any other audience get 401 `auth.audience_not_accepted`.
 */
export async function authenticateApi(request: Request, scope: ApiScope): Promise<Principal> {
  const token = bearerToken(request);
  if (!token) throw unauthorized("auth.missing_token");
  const audience = getConfig().THIRD_PARTY_AUDIENCE;
  let claims;
  try {
    claims = await getContext().verify(token, [audience]);
  } catch (err) {
    throw unauthorized(err instanceof errors.JWTClaimValidationFailed && err.claim === "aud" ? "auth.audience_not_accepted" : "auth.invalid_token");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (audiences.length > 1) throw unauthorized("auth.audience_not_accepted");
  return toThirdPartyPrincipal(getDb(), claims, scope);
}
