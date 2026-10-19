import { sql } from "kysely";
import type { Db } from "../client";

export type IdempotencyClaim =
  | { state: "claimed" }
  | { state: "replay"; status: number; body: unknown }
  | { state: "in_progress" }
  | { state: "mismatch" };

/**
 * Claims (scope, key) for a request. Expired entries are reclaimed.
 * - claimed: caller must execute and then `completeIdempotency` (or `releaseIdempotency` on failure)
 * - replay: same key + same request already completed → return the stored response
 * - in_progress: same request currently running elsewhere
 * - mismatch: same key used with a different request
 */
export async function claimIdempotency(
  db: Db,
  input: { scope: string; key: string; requestHash: string; ttlSeconds: number },
): Promise<IdempotencyClaim> {
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
  const claimed = await db
    .insertInto("idempotency")
    .values({ scope: input.scope, key: input.key, request_hash: input.requestHash, expires_at: expiresAt })
    .onConflict((oc) =>
      oc.columns(["scope", "key"]).doUpdateSet({
        request_hash: input.requestHash,
        status: "pending",
        response_status: null,
        response_body: null,
        expires_at: expiresAt,
      }).where("idempotency.expires_at", "<", sql<Date>`now()`),
    )
    .returning("key")
    .executeTakeFirst();
  if (claimed) return { state: "claimed" };

  const row = await db
    .selectFrom("idempotency")
    .selectAll()
    .where("scope", "=", input.scope)
    .where("key", "=", input.key)
    .executeTakeFirst();
  if (!row) return claimIdempotency(db, input);
  if (row.request_hash !== input.requestHash) return { state: "mismatch" };
  if (row.status === "pending") return { state: "in_progress" };
  return { state: "replay", status: row.response_status ?? 200, body: row.response_body };
}

export async function completeIdempotency(
  db: Db,
  input: { scope: string; key: string; status: number; body: unknown },
): Promise<void> {
  await db
    .updateTable("idempotency")
    .set({ status: "done", response_status: input.status, response_body: JSON.stringify(input.body) })
    .where("scope", "=", input.scope)
    .where("key", "=", input.key)
    .execute();
}

/** Drops a pending claim after a failed attempt so the client may retry. */
export async function releaseIdempotency(db: Db, scope: string, key: string): Promise<void> {
  await db.deleteFrom("idempotency").where("scope", "=", scope).where("key", "=", key).where("status", "=", "pending").execute();
}

export async function purgeExpiredIdempotency(db: Db): Promise<number> {
  const res = await db.deleteFrom("idempotency").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  return Number(res.numDeletedRows);
}
