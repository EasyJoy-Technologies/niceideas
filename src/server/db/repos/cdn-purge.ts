import { sql, type Selectable } from "kysely";
import type { Db } from "../client";
import type { CdnPurgeTable } from "../schema-share";

export type CdnPurge = Selectable<CdnPurgeTable>;

/** Queues URLs for purging (call in the transaction that took their content offline); a queued URL is due again now. */
export async function insertCdnPurges(db: Db, urls: string[]): Promise<void> {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return;
  await db
    .insertInto("cdn_purge")
    .values(unique.map((url) => ({ url })))
    .onConflict((oc) => oc.column("url").doUpdateSet({ run_after: sql`now()`, attempts: 0, last_error: null }))
    .execute();
}

/** Takes up to `limit` due URLs, leased for `leaseSeconds` (a crashed worker leaves them due again). Counts the attempt. */
export async function claimCdnPurges(db: Db, limit: number, leaseSeconds: number): Promise<CdnPurge[]> {
  const r = await sql<CdnPurge>`
    UPDATE cdn_purge c SET attempts = c.attempts + 1, run_after = date_trunc('milliseconds', now() + make_interval(secs => ${leaseSeconds}))
    FROM (SELECT url FROM cdn_purge WHERE run_after <= now() ORDER BY run_after LIMIT ${limit} FOR UPDATE SKIP LOCKED) due
    WHERE c.url = due.url
    RETURNING c.*`.execute(db);
  return r.rows;
}

/** Purged (or given up): removed, unless queued again meanwhile (a newer lease-free due time). */
export async function deleteCdnPurges(db: Db, items: Pick<CdnPurge, "url" | "run_after">[]): Promise<void> {
  for (const i of items) await db.deleteFrom("cdn_purge").where("url", "=", i.url).where("run_after", "=", i.run_after).execute();
}

export async function retryCdnPurges(db: Db, items: Pick<CdnPurge, "url" | "run_after">[], delaySeconds: number, error: string): Promise<void> {
  for (const i of items) {
    await db
      .updateTable("cdn_purge")
      .set({ run_after: sql`now() + make_interval(secs => ${delaySeconds})`, last_error: error })
      .where("url", "=", i.url)
      .where("run_after", "=", i.run_after)
      .execute();
  }
}

export async function nextCdnPurgeDueAt(db: Db): Promise<Date | null> {
  const r = await db.selectFrom("cdn_purge").select((eb) => eb.fn.min("run_after").as("at")).executeTakeFirst();
  return r?.at ?? null;
}
