import { createHash } from "node:crypto";
import type { Db } from "@/server/db/client";
import { claimIdempotency, completeIdempotency, releaseIdempotency } from "@/server/db/repos/idempotency";
import { canonicalJson } from "@/server/documents/hash";
import { ApiError } from "./errors";
import { jsonOk } from "./json";

const KEY_PATTERN = /^[\x21-\x7e]{1,200}$/;
const TTL_SECONDS = 24 * 60 * 60;

export type HandlerResult = { status: number; body: unknown };

/**
 * Executes a mutating request at most once per `Idempotency-Key` (24 h).
 * Same key + same request → stored response replayed; same key + different
 * request → 422; concurrent duplicate → 409. Failed attempts release the key.
 * Without the header the handler simply runs (first-party clients), unless `required`.
 */
export async function withIdempotency(
  db: Db,
  request: Request,
  input: { scope: string; payload: unknown; required?: boolean },
  run: () => Promise<HandlerResult>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key");
  if (key === null) {
    if (input.required) throw new ApiError("idempotency.key_required", 400);
    const result = await run();
    return jsonOk(result.body, result.status);
  }
  if (!KEY_PATTERN.test(key)) throw new ApiError("idempotency.key_invalid", 400);

  const url = new URL(request.url);
  const requestHash = createHash("sha256").update(`${request.method} ${url.pathname}\n${canonicalJson(input.payload ?? null)}`).digest("hex");
  const claim = await claimIdempotency(db, { scope: input.scope, key, requestHash, ttlSeconds: TTL_SECONDS });
  if (claim.state === "replay") return jsonOk(claim.body, claim.status, { "Idempotent-Replayed": "true" });
  if (claim.state === "in_progress") throw new ApiError("idempotency.in_progress", 409);
  if (claim.state === "mismatch") throw new ApiError("idempotency.key_reused", 422);

  let result: HandlerResult;
  try {
    result = await run();
  } catch (err) {
    await releaseIdempotency(db, input.scope, key).catch((e) => console.error("[idempotency] release failed", e));
    throw err;
  }
  await completeIdempotency(db, { scope: input.scope, key, status: result.status, body: result.body });
  return jsonOk(result.body, result.status);
}
