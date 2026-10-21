import { sql } from "kysely";
import type { Db } from "../client";

/** Records a spent challenge; false if it was already spent. */
export async function spendChallenge(db: Db, challenge: string, expiresAt: Date): Promise<boolean> {
  const row = await db.insertInto("pow_used").values({ challenge, expires_at: expiresAt }).onConflict((oc) => oc.doNothing()).returning("challenge").executeTakeFirst();
  return row !== undefined;
}

export async function purgeSpentChallenges(db: Db): Promise<number> {
  const r = await db.deleteFrom("pow_used").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  return Number(r.numDeletedRows);
}
