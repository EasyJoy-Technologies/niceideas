import { sql } from "kysely";
import type { Db } from "../client";

/** Stores a ticket hash valid for `ttlSeconds` (database clock); returns its expiry. */
export async function insertWebTicket(db: Db, row: { idHash: string; userId: string; ttlSeconds: number }): Promise<Date> {
  const r = await db
    .insertInto("web_ticket")
    .values({ id_hash: row.idHash, user_id: row.userId, expires_at: sql<Date>`now() + make_interval(secs => ${row.ttlSeconds})` })
    .returning("expires_at")
    .executeTakeFirstOrThrow();
  return r.expires_at;
}

export type TicketUse = { state: "unexpired"; userId: string } | { state: "expired" | "used" | "unknown" };

/**
 * Redeems a ticket: marks it used and returns its user in one statement, so concurrent
 * requests with the same ticket cannot both get it. A used or unknown ticket changes nothing.
 */
export async function consumeWebTicket(db: Db, idHash: string): Promise<TicketUse> {
  const row = await db
    .updateTable("web_ticket")
    .set({ used_at: sql<Date>`now()` })
    .where("id_hash", "=", idHash)
    .where("used_at", "is", null)
    .returning(["user_id", sql<boolean>`expires_at > now()`.as("live")])
    .executeTakeFirst();
  if (row) return row.live ? { state: "unexpired", userId: row.user_id } : { state: "expired" };
  // Diagnostics only: tell a second use from a ticket that never existed (or was purged).
  const known = await db.selectFrom("web_ticket").select("id_hash").where("id_hash", "=", idHash).executeTakeFirst();
  return { state: known ? "used" : "unknown" };
}

/** Daily maintenance: tickets live 60 seconds, so every expired one (used or not) goes. */
export async function purgeExpiredWebTickets(db: Db): Promise<number> {
  const r = await db.deleteFrom("web_ticket").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  return Number(r.numDeletedRows ?? 0);
}
