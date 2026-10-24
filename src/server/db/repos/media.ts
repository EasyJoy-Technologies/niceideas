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

/**
 * Media referenced by the current revision of at least one active post.
 * Used to decide what must stay in / leave the public bucket.
 */
export async function filterPubliclyReferenced(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectFrom("revision_media as rm")
    .innerJoin("post as p", "p.current_revision_id", "rm.revision_id")
    .select("rm.media_id")
    .distinct()
    .where("rm.media_id", "in", ids)
    .where("p.status", "=", "active")
    .execute();
  return new Set(rows.map((r) => r.media_id));
}

/** Marks media as no longer public. Unreferenced ones also start the 7-day detach clock. */
export async function markMediaWithdrawn(db: Db, ids: string[], detach: boolean): Promise<void> {
  if (ids.length === 0) return;
  await db
    .updateTable("media")
    .set(detach ? { public_at: null, detached_at: sql`coalesce(detached_at, now())` } : { public_at: null })
    .where("id", "in", ids)
    .execute();
}

/** Media still referenced by the current revision of any existing post (any status). */
export async function filterReferencedByAnyPost(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectFrom("revision_media as rm")
    .innerJoin("post as p", "p.current_revision_id", "rm.revision_id")
    .select("rm.media_id")
    .distinct()
    .where("rm.media_id", "in", ids)
    .execute();
  return new Set(rows.map((r) => r.media_id));
}
