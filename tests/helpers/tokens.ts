import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWTPayload } from "jose";

export const TEST_ISSUER = "https://id.test/oidc";
export const AUD_INTL = "https://api.nicematrix.com";
export const AUD_CN = "https://apiv3.ej-mobile.cn";

/** ES384 key pair + local JWKS mimicking Logto. */
export async function createTestIssuer() {
  const { privateKey, publicKey } = await generateKeyPair("ES384");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES384" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: JWTPayload, opts: { issuer?: string; expiresIn?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES384", kid: "k1" })
      .setIssuer(opts.issuer ?? TEST_ISSUER)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "1h")
      .sign(privateKey);
  return { keys, sign };
}
