import { sql } from "kysely";
import type { Db } from "../client";
import type { Media, NewMedia } from "../schema";

export async function findMediaByOwnerSha(db: Db, ownerId: string, sha256: string): Promise<Media | undefined> {
  return db.selectFrom("media").selectAll().where("owner_id", "=", ownerId).where("sha256", "=", sha256).executeTakeFirst();
}

export async function findMediaByIds(db: Db, ids: string[]): Promise<Media[]> {
  if (ids.length === 0) return [];
  return db.selectFrom("media").selectAll().where("id", "in", ids).execute();
}

/** Inserts media; on a concurrent duplicate upload returns the existing row. */
export async function insertMediaOrGet(db: Db, row: NewMedia): Promise<{ media: Media; created: boolean }> {
  const inserted = await db
    .insertInto("media")
    .values(row)
    .onConflict((oc) => oc.columns(["owner_id", "sha256"]).doNothing())
    .returningAll()
    .executeTakeFirst();
  if (inserted) return { media: inserted, created: true };
  const existing = await findMediaByOwnerSha(db, row.owner_id, row.sha256);
  if (!existing) throw new Error("media insert conflict without existing row");
  return { media: existing, created: false };
}

export async function markMediaPublic(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .updateTable("media")
    .set({ public_at: sql`coalesce(public_at, now())`, detached_at: null })
    .where("id", "in", ids)
    .execute();
}

