import { sql } from "kysely";
import type { Db } from "../client";

/**
 * Objects being stored under a prefix before their media row exists (plan
 * docs/plan/2026-10-26-share-review-fixes.md S2, F20): recorded before the first PUT, dropped in the
 * transaction that inserts the media row; leftovers are cleaned up (maintenance, account deletion).
 */
export async function recordUpload(db: Db, prefix: string, ownerId: string): Promise<void> {
  await db.insertInto("media_upload").values({ prefix, owner_id: ownerId }).execute();
}

export async function dropUpload(db: Db, prefix: string): Promise<void> {
  await db.deleteFrom("media_upload").where("prefix", "=", prefix).execute();
}

/** Uploads started over `olderThanHours` ago that never got their media row. */
export async function listStaleUploads(db: Db, olderThanHours: number, limit: number): Promise<string[]> {
  const rows = await db
    .selectFrom("media_upload")
    .select("prefix")
    .where("created_at", "<", sql<Date>`now() - make_interval(hours => ${olderThanHours})`)
    .orderBy("created_at")
    .limit(limit)
    .execute();
  return rows.map((r) => r.prefix);
}

export async function uploadsOfOwner(db: Db, ownerId: string): Promise<string[]> {
  return (await db.selectFrom("media_upload").select("prefix").where("owner_id", "=", ownerId).execute()).map((r) => r.prefix);
}
