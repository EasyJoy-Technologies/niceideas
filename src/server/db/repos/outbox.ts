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
 * Takes up to `limit` due notifications (oldest first) and leases them for `leaseSeconds`: a worker
 * that dies mid-delivery leaves them due again afterwards. Counts the attempt. Safe with several workers.
 */
export async function claimOutbox(db: Db, limit: number, leaseSeconds: number): Promise<OutboxItem[]> {
  const r = await sql<OutboxItem>`
    UPDATE outbox o SET attempts = o.attempts + 1, run_after = now() + make_interval(secs => ${leaseSeconds}), updated_at = now()
    FROM (SELECT id FROM outbox WHERE state = 'pending' AND run_after <= now() ORDER BY run_after, created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED) due
    WHERE o.id = due.id
    RETURNING o.*`.execute(db);
  return r.rows.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
}

/** When the next notification falls due (same filter as `claimOutbox`); null when none is pending. */
export async function nextOutboxDueAt(db: Db): Promise<Date | null> {
  const r = await db.selectFrom("outbox").select((eb) => eb.fn.min("run_after").as("at")).where("state", "=", "pending").executeTakeFirst();
  return r?.at ?? null;
}

/** Delivered (`done`), given up (`failed`), or due again after `retryInSeconds`. */
export async function settleOutbox(db: Db, id: string, outcome: { state: "done" } | { state: "failed"; error: string } | { retryInSeconds: number; error: string }): Promise<void> {
  const set =
    "retryInSeconds" in outcome
      ? { last_error: outcome.error, run_after: sql<Date>`now() + make_interval(secs => ${outcome.retryInSeconds})`, updated_at: sql<Date>`now()` }
      : { state: outcome.state, last_error: outcome.state === "failed" ? outcome.error : null, updated_at: sql<Date>`now()` };
  await db.updateTable("outbox").set(set).where("id", "=", id).execute();
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
