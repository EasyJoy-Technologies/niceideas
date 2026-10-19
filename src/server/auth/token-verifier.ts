import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/** Small allowance for clock drift between hosts (same as nicematrix-backend). */
const CLOCK_TOLERANCE_SEC = 5;

export type TokenVerifier = (token: string, audiences: string[]) => Promise<JWTPayload>;

/**
 * Verifies a Logto JWT access token: signature (JWKS), issuer, expiry and
 * audience. One forced JWKS refresh is attempted on a key-rotation miss.
 */
export function createTokenVerifier(issuer: string, keys: JWTVerifyGetKey & { reload?: () => Promise<void> }): TokenVerifier {
  return async (token, audiences) => {
    const options = { issuer, audience: audiences, clockTolerance: CLOCK_TOLERANCE_SEC };
    try {
      return (await jwtVerify(token, keys, options)).payload;
    } catch (err) {
      if ((err instanceof errors.JWKSNoMatchingKey || err instanceof errors.JWKSTimeout) && keys.reload) {
        await keys.reload();
        return (await jwtVerify(token, keys, options)).payload;
      }
      throw err;
    }
  };
}

export function remoteKeys(jwksUri: string) {
  return createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
}
