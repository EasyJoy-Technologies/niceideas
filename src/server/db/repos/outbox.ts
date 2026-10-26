import { sql, type Selectable } from "kysely";
import type { Db } from "../client";
import type { OutboxKind } from "../schema";
import type { OutboxTable } from "../schema-share";

export type OutboxItem = Selectable<OutboxTable>;

/**
 * Queues a signed notification to the NiceMatrix backend (delivered with retries by the
 * worker). `dedupeKey` makes enqueueing idempotent: the same key is queued once.
 */
export async function enqueueOutbox(db: Db, item: { kind: OutboxKind; dedupeKey: string; payload: unknown }): Promise<void> {
  await db
    .insertInto("outbox")
    .values({ kind: item.kind, dedupe_key: item.dedupeKey, payload: JSON.stringify(item.payload) })
    .onConflict((oc) => oc.column("dedupe_key").doNothing())
    .execute();
}

/**
 * Takes the oldest due notification and leases it for `leaseSeconds` under a new lease token: a
 * worker that dies mid-delivery leaves it due again afterwards. Counts the attempt. One at a time, so
 * a lease never runs out while the item waits behind others (F13). Safe with several workers.
 */
export async function claimOutboxItem(db: Db, leaseSeconds: number): Promise<OutboxItem | undefined> {
  const r = await sql<OutboxItem>`
    UPDATE outbox o SET attempts = o.attempts + 1, run_after = now() + make_interval(secs => ${leaseSeconds}), lease_token = gen_random_uuid(), updated_at = now()
    FROM (SELECT id FROM outbox WHERE state = 'pending' AND run_after <= now() ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED) due
    WHERE o.id = due.id
    RETURNING o.*`.execute(db);
  return r.rows[0];
}

/** When the next notification falls due (same filter as `claimOutbox`); null when none is pending. */
export async function nextOutboxDueAt(db: Db): Promise<Date | null> {
  const r = await db.selectFrom("outbox").select((eb) => eb.fn.min("run_after").as("at")).where("state", "=", "pending").executeTakeFirst();
  return r?.at ?? null;
}

/**
 * Delivered (`done`), given up (`failed`), or due again after `retryInSeconds` — only while the claim
 * `item` still holds its lease; false when it lost it (nothing written).
 */
export async function settleOutbox(
  db: Db,
  item: Pick<OutboxItem, "id" | "lease_token">,
  outcome: { state: "done" } | { state: "failed"; error: string } | { retryInSeconds: number; error: string },
): Promise<boolean> {
  const set =
    "retryInSeconds" in outcome
      ? { last_error: outcome.error, run_after: sql<Date>`now() + make_interval(secs => ${outcome.retryInSeconds})`, lease_token: null, updated_at: sql<Date>`now()` }
      : { state: outcome.state, last_error: outcome.state === "failed" ? outcome.error : null, lease_token: null, updated_at: sql<Date>`now()` };
  const r = await db.updateTable("outbox").set(set).where("id", "=", item.id).where("state", "=", "pending").where("lease_token", "=", item.lease_token).executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0) > 0;
}

/** Delivered notifications are kept this long (diagnostics), then dropped by maintenance. */
export async function purgeDeliveredOutbox(db: Db, olderThanDays: number): Promise<number> {
  const r = await db
    .deleteFrom("outbox")
    .where("state", "=", "done")
    .where("updated_at", "<", sql<Date>`now() - make_interval(days => ${olderThanDays})`)
    .executeTakeFirst();
  return Number(r.numDeletedRows ?? 0);
}
