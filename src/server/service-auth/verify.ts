import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/server/db/client";
import { claimServiceNonce } from "@/server/db/repos/service-nonces";
import { ApiError, forbidden, unauthorized } from "@/server/http/errors";
import { MAX_SKEW_SECONDS, NONCE_PATTERN, NONCE_TTL_SECONDS, signParts } from "./signature";

export type SignedRequest = { method: string; pathWithQuery: string; headers: Headers; body: Uint8Array };

function equalHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Verifies a signed service request (fail closed): no key → 503; missing headers or bad
 * signature → 401 `signature.invalid`; outside ±300 s → 401 `signature.expired`; caller not
 * allowed → 403 `service.not_allowed`; reused nonce → 401 `nonce.replayed`. The signature is
 * checked before the nonce is stored, so unsigned callers cannot fill or burn nonces.
 */
export async function verifyServiceRequest(db: Db, req: SignedRequest, opts: { keys: string[]; services: string[]; now?: number }): Promise<{ service: string }> {
  if (opts.keys.length === 0) throw new ApiError("endpoint.disabled", 503);
  const h = (name: string) => (req.headers.get(name) ?? "").trim();
  const service = h("x-nm-service");
  const timestamp = h("x-nm-timestamp");
  const nonce = h("x-nm-nonce");
  const signature = h("x-nm-signature");
  if (!service || !timestamp || !nonce || !signature || !NONCE_PATTERN.test(nonce)) throw unauthorized("signature.invalid");
  if (!opts.services.includes(service)) throw forbidden("service.not_allowed");
  const ts = Number(timestamp);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now - ts) > MAX_SKEW_SECONDS) throw unauthorized("signature.expired");
  const parts = { method: req.method, pathWithQuery: req.pathWithQuery, service, timestamp, nonce, body: req.body };
  if (!opts.keys.some((key) => equalHex(signature, signParts(key, parts)))) throw unauthorized("signature.invalid");
  if (!(await claimServiceNonce(db, { nonce, service, ttlSeconds: NONCE_TTL_SECONDS }))) throw unauthorized("nonce.replayed");
  return { service };
}
