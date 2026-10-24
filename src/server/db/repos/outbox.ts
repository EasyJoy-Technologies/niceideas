import type { Db } from "../client";
import type { OutboxKind } from "../schema";

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
