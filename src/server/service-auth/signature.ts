import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * NiceMatrix service-to-service signature (same algorithm as nicematrix-backend
 * apps/api/src/shared/service-auth.js; contract niceideas-share.md §3.1):
 * hex(HMAC_SHA256(key, METHOD \n PATH_WITH_QUERY \n SERVICE \n TIMESTAMP \n NONCE \n sha256hex(body))).
 */
export const MAX_SKEW_SECONDS = 300;
/** Nonces are kept for twice the skew window; older ones fail the timestamp check first. */
export const NONCE_TTL_SECONDS = MAX_SKEW_SECONDS * 2;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type SignedParts = { method: string; pathWithQuery: string; service: string; timestamp: string; nonce: string; body: string | Uint8Array };

export const sha256Hex = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");

export function signingString(p: SignedParts): string {
  return [p.method.toUpperCase(), p.pathWithQuery, p.service, p.timestamp, p.nonce, sha256Hex(p.body)].join("\n");
}

export const signParts = (key: string, p: SignedParts) => createHmac("sha256", key).update(signingString(p)).digest("hex");

/** Non-secret key fingerprint (rotation hint only). */
export const keyId = (key: string) => sha256Hex(key).slice(0, 8);

/** Headers of an outgoing signed request (NiceIdeas → backend, and tests / smoke checks). */
export function serviceHeaders(key: string, service: string, method: string, pathWithQuery: string, body: string | Uint8Array = ""): Record<string, string> {
  const parts = { method, pathWithQuery, service, timestamp: String(Math.floor(Date.now() / 1000)), nonce: randomBytes(16).toString("hex"), body };
  return {
    "X-NM-Service": service,
    "X-NM-Timestamp": parts.timestamp,
    "X-NM-Nonce": parts.nonce,
    "X-NM-Signature": signParts(key, parts),
    "X-NM-Key-Id": keyId(key),
  };
}
