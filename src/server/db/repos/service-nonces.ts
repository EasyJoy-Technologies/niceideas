import { sql } from "kysely";
import type { Db } from "../client";

/** Stores a nonce once; false when it was already used (replay). */
export async function claimServiceNonce(db: Db, n: { nonce: string; service: string; ttlSeconds: number }): Promise<boolean> {
  const r = await db
    .insertInto("service_nonce")
    .values({ nonce: n.nonce, service: n.service, expires_at: sql<Date>`now() + make_interval(secs => ${n.ttlSeconds})` })
    .onConflict((oc) => oc.column("nonce").doNothing())
    .executeTakeFirst();
  return Number(r.numInsertedOrUpdatedRows ?? 0) > 0;
}

export async function purgeExpiredServiceNonces(db: Db): Promise<number> {
  const r = await db.deleteFrom("service_nonce").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  return Number(r.numDeletedRows ?? 0);
}
