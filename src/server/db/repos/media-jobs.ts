import { sql } from "kysely";
import type { Db } from "../client";
import type { Media, MediaJobState, MediaKind } from "../schema";

export type MediaGrant = { ref: string; kind: MediaKind; mime: string; bytes: number; url: string | null; expiresAt: Date | null };

/** Media of an owner already stored for the given NiceNote refs. */
export async function findMediaByRefs(db: Db, ownerId: string, refs: string[]): Promise<Media[]> {
  if (refs.length === 0) return [];
  return db.selectFrom("media").selectAll().where("owner_id", "=", ownerId).where("source_ref", "in", refs).execute();
}

/** Current job state per ref (refs without a job are absent). */
export async function mediaJobStates(db: Db, ownerId: string, refs: string[]): Promise<Map<string, MediaJobState>> {
  if (refs.length === 0) return new Map();
  const rows = await db.selectFrom("media_job").select(["ref", "state"]).where("owner_id", "=", ownerId).where("ref", "in", refs).execute();
  return new Map(rows.map((r) => [r.ref, r.state]));
}

/**
 * Queues fetching of a media not stored yet. A new grant URL revives a failed job and replaces
 * the URL of a waiting one; a running or finished job is left alone.
 */
export async function upsertMediaJob(db: Db, ownerId: string, g: MediaGrant): Promise<void> {
  await db
    .insertInto("media_job")
    .values({ owner_id: ownerId, ref: g.ref, kind: g.kind, mime: g.mime, bytes: g.bytes, url: g.url, url_expires_at: g.expiresAt })
    .onConflict((oc) =>
      oc.columns(["owner_id", "ref"]).doUpdateSet({
        url: sql`coalesce(excluded.url, media_job.url)`,
        url_expires_at: sql`CASE WHEN excluded.url IS NULL THEN media_job.url_expires_at ELSE excluded.url_expires_at END`,
        state: sql`CASE WHEN media_job.state = 'failed' AND excluded.url IS NOT NULL THEN 'pending' ELSE media_job.state END`,
        attempts: sql`CASE WHEN media_job.state = 'failed' AND excluded.url IS NOT NULL THEN 0 ELSE media_job.attempts END`,
        error: sql`CASE WHEN media_job.state = 'failed' AND excluded.url IS NOT NULL THEN NULL ELSE media_job.error END`,
        run_after: sql`CASE WHEN media_job.state = 'failed' AND excluded.url IS NOT NULL THEN now() ELSE media_job.run_after END`,
        updated_at: sql`now()`,
      }),
    )
    .execute();
}
