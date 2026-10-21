import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { CALLBACK_PATH, type WebAuthSettings } from "./settings";

/** OpenID Connect operations the sign-in flow needs (replaced by a fake in tests). */
export type OidcProvider = {
  authorizeUrl(p: { state: string; nonce: string; challenge: string; silent: boolean }): Promise<string>;
  /** Code → verified ID token claims (signature, issuer, audience, nonce). */
  redeem(code: string, verifier: string, nonce: string): Promise<JWTPayload>;
  endSessionUrl(): Promise<string>;
};

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; end_session_endpoint: string; jwks_uri: string };

const SCOPE = "openid profile";
const TIMEOUT_MS = 8_000;

/** Logto (or any OIDC issuer) via discovery; client_secret_basic + PKCE S256. */
export function logtoProvider(s: WebAuthSettings): OidcProvider {
  let discovery: Promise<Discovery> | null = null;
  let keys: ReturnType<typeof createRemoteJWKSet> | null = null;
  const discover = () => {
    discovery ??= fetch(`${s.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then(async (r) => {
      if (!r.ok) throw new Error(`oidc discovery failed: ${r.status}`);
      return (await r.json()) as Discovery;
    });
    discovery.catch(() => (discovery = null));
    return discovery;
  };
  const redirectUri = `${s.baseUrl}${CALLBACK_PATH}`;
  return {
    async authorizeUrl({ state, nonce, challenge, silent }) {
      const d = await discover();
      const q = new URLSearchParams({
        client_id: s.clientId, response_type: "code", redirect_uri: redirectUri, scope: SCOPE,
        state, nonce, code_challenge: challenge, code_challenge_method: "S256",
      });
      if (silent) q.set("prompt", "none");
      return `${d.authorization_endpoint}?${q}`;
    },
    async redeem(code, verifier, nonce) {
      const d = await discover();
      const res = await fetch(d.token_endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${encodeURIComponent(s.clientId)}:${encodeURIComponent(s.clientSecret)}`).toString("base64")}` },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }),
      });
      if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
      const { id_token: idToken } = (await res.json()) as { id_token?: string };
      if (!idToken) throw new Error("token response without id_token");
      keys ??= createRemoteJWKSet(new URL(d.jwks_uri), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
      const { payload } = await jwtVerify(idToken, keys, { issuer: d.issuer, audience: s.clientId, clockTolerance: 5 });
      if (payload.nonce !== nonce) throw new Error("id_token nonce mismatch");
      return payload;
    },
    async endSessionUrl() {
      const d = await discover();
      return `${d.end_session_endpoint}?${new URLSearchParams({ client_id: s.clientId, post_logout_redirect_uri: `${s.baseUrl}/` })}`;
    },
  };
}

let provider: OidcProvider | null = null;
let override: OidcProvider | null = null;

export function oidcProvider(s: WebAuthSettings): OidcProvider {
  if (override) return override;
  provider ??= logtoProvider(s);
  return provider;
}

/** Test hook. */
export function setOidcProviderForTests(p: OidcProvider | null): void {
  override = p;
}
