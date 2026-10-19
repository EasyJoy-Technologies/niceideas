import { getConfig } from "@/server/config/env";
import { unauthorized } from "@/server/http/errors";
import { parseFirstPartyPolicy, type FirstPartyPolicy } from "./first-party";
import { toPrincipal, type Principal } from "./principal";
import { createTokenVerifier, remoteKeys, type TokenVerifier } from "./token-verifier";

type AuthContext = { verify: TokenVerifier; policy: FirstPartyPolicy };
let context: AuthContext | null = null;

function getContext(): AuthContext {
  if (!context) {
    const cfg = getConfig();
    context = {
      verify: createTokenVerifier(cfg.LOGTO_ISSUER, remoteKeys(cfg.LOGTO_JWKS_URI)),
      policy: parseFirstPartyPolicy(cfg.FIRST_PARTY_AUDIENCES, cfg.FIRST_PARTY_CLIENT_IDS),
    };
  }
  return context;
}

/** Test hook: inject a verifier / policy. */
export function setAuthContextForTests(next: AuthContext | null): void {
  context = next;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Resolves the first-party caller of an API request, or throws 401/403. */
export async function authenticateFirstParty(request: Request): Promise<Principal> {
  const token = bearerToken(request);
  if (!token) throw unauthorized("auth.missing_token");
  const { verify, policy } = getContext();
  let claims;
  try {
    claims = await verify(token, [...policy.audiences.keys()]);
  } catch {
    throw unauthorized("auth.invalid_token");
  }
  return toPrincipal(claims, policy);
}
