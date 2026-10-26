import { sql, type Selectable, type UpdateObject } from "kysely";
import type { Db } from "../client";
import type { Database } from "../schema";
import type { Media, MediaJobState, MediaKind } from "../schema";
import type { MediaJobTable } from "../schema-share";

export type MediaJob = Selectable<MediaJobTable>;
/** A claimed job: writes of the claim apply only while its `lease_token` holds the lease (F13). */
export type MediaJobLease = Pick<MediaJob, "owner_id" | "ref" | "lease_token">;
export type MediaGrant = { ref: string; kind: MediaKind; mime: string; bytes: number; url: string | null; expiresAt: Date | null };

/** Stored media of an owner by NiceNote ref (refs not stored yet are absent). */
export async function findMediaByRefs(db: Db, ownerId: string, refs: string[]): Promise<Map<string, Media>> {
  if (refs.length === 0) return new Map();
  const rows = await db
    .selectFrom("media_job as j")
    .innerJoin("media as m", "m.id", "j.media_id")
    .selectAll("m")
    .select("j.ref as job_ref")
    .where("j.owner_id", "=", ownerId)
    .where("j.ref", "in", refs)
    .where("j.state", "=", "done")
    .execute();
  return new Map(rows.map(({ job_ref, ...m }) => [job_ref, m as Media]));
}

/** Job state and failure reason per ref (refs without a job are absent). */
export async function mediaJobStates(db: Db, ownerId: string, refs: string[]): Promise<Map<string, { state: MediaJobState; error: string | null }>> {
  if (refs.length === 0) return new Map();
  const rows = await db.selectFrom("media_job").select(["ref", "state", "error"]).where("owner_id", "=", ownerId).where("ref", "in", refs).execute();
  return new Map(rows.map((r) => [r.ref, { state: r.state, error: r.error }]));
}

/**
 * Queues fetching of a media not stored yet. A new grant URL queues a temporary failure again (and a
 * finished job whose media was purged); a permanent failure (`rejected`) is never fetched again; the
 * URL of a waiting job is replaced.
 */
export async function upsertMediaJob(db: Db, ownerId: string, g: MediaGrant): Promise<void> {
  const revive = sql`(media_job.state = 'failed' OR (media_job.state = 'done' AND media_job.media_id IS NULL)) AND excluded.url IS NOT NULL`;
  await db
    .insertInto("media_job")
    .values({ owner_id: ownerId, ref: g.ref, kind: g.kind, mime: g.mime, bytes: g.bytes, url: g.url, url_expires_at: g.expiresAt })
    .onConflict((oc) =>
      oc.columns(["owner_id", "ref"]).doUpdateSet({
        url: sql`CASE WHEN media_job.state = 'rejected' THEN media_job.url ELSE coalesce(excluded.url, media_job.url) END`,
        url_expires_at: sql`CASE WHEN media_job.state = 'rejected' OR excluded.url IS NULL THEN media_job.url_expires_at ELSE excluded.url_expires_at END`,
        kind: sql`CASE WHEN ${revive} THEN excluded.kind ELSE media_job.kind END`,
        state: sql`CASE WHEN ${revive} THEN 'pending' ELSE media_job.state END`,
        attempts: sql`CASE WHEN ${revive} THEN 0 ELSE media_job.attempts END`,
        error: sql`CASE WHEN ${revive} THEN NULL ELSE media_job.error END`,
        run_after: sql`CASE WHEN ${revive} THEN now() ELSE media_job.run_after END`,
        lease_token: sql`CASE WHEN ${revive} THEN NULL ELSE media_job.lease_token END`,
        updated_at: sql`now()`,
      }),
    )
    .execute();
}

/** Records that a ref is stored as `mediaId` (worker result; web uploads in tests). */
export async function linkMediaRef(db: Db, ownerId: string, ref: string, media: Pick<Media, "id" | "kind" | "mime">): Promise<void> {
  await db
    .insertInto("media_job")
    .values({ owner_id: ownerId, ref, kind: media.kind, mime: media.mime, bytes: null, url: null, url_expires_at: null, state: "done", media_id: media.id })
    .onConflict((oc) => oc.columns(["owner_id", "ref"]).doUpdateSet({ state: "done", media_id: media.id, error: null, lease_token: null, updated_at: sql`now()` }))
    .execute();
}

/**
 * Takes the next due job with a grant (pending, or running with an expired lease after a crash),
 * marks it running until `now + leaseSeconds` under a new lease token and counts the attempt. Safe
 * with several workers: an earlier claim of the same job loses its lease (its writes do nothing).
 */
export async function claimMediaJob(db: Db, leaseSeconds: number): Promise<MediaJob | undefined> {
  const r = await sql<MediaJob>`
    UPDATE media_job j SET state = 'running', attempts = j.attempts + 1, run_after = now() + make_interval(secs => ${leaseSeconds}), lease_token = gen_random_uuid(), updated_at = now()
    FROM (
      SELECT owner_id, ref FROM media_job
      WHERE state IN ('pending', 'running') AND run_after <= now() AND url IS NOT NULL
      ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED
    ) due
    WHERE j.owner_id = due.owner_id AND j.ref = due.ref
    RETURNING j.*`.execute(db);
  return r.rows[0];
}

/** When the next media job or share refresh falls due (same filters as the claims); null when none is waiting. */
export async function nextMediaJobDueAt(db: Db): Promise<Date | null> {
  const job = await db
    .selectFrom("media_job")
    .select((eb) => eb.fn.min("run_after").as("at"))
    .where("state", "in", ["pending", "running"])
    .where("url", "is not", null)
    .executeTakeFirst();
  const refresh = await db.selectFrom("media_job").select((eb) => eb.fn.min("refresh_due_at").as("at")).executeTakeFirst();
  const times = [job?.at, refresh?.at].filter((t): t is Date => t instanceof Date);
  return times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null;
}

/** Updates the job only while the claim `j` still holds its lease; true when it did. */
async function updateLeased(db: Db, j: MediaJobLease, set: UpdateObject<Database, "media_job">): Promise<boolean> {
  const r = await db
    .updateTable("media_job")
    .set(set)
    .where("owner_id", "=", j.owner_id)
    .where("ref", "=", j.ref)
    .where("state", "=", "running")
    .where("lease_token", "=", j.lease_token)
    .executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0) > 0;
}

/** Extends the lease of a running job (long downloads / transcodes); false when the lease was lost. */
export async function extendMediaJobLease(db: Db, j: MediaJobLease, leaseSeconds: number): Promise<boolean> {
  return updateLeased(db, j, { run_after: sql`now() + make_interval(secs => ${leaseSeconds})`, updated_at: sql`now()` });
}

/** Refresh due times are tokens compared in JavaScript: millisecond precision. */
const REFRESH_NOW = sql<Date>`date_trunc('milliseconds', now())`;

/**
 * Final outcome of a running job: stored (`done`), temporary failure (`failed`) or permanent
 * (`rejected`). The shares using it are due for a refresh in the same write (F12); returns that due
 * time, the token for `finishMediaRefresh` — null when the claim lost its lease (nothing written).
 */
export async function settleMediaJob(db: Db, j: MediaJobLease, outcome: { state: "done"; mediaId: string } | { state: "failed" | "rejected"; error: string }): Promise<Date | null> {
  const r = await db
    .updateTable("media_job")
    .set({
      ...(outcome.state === "done" ? { state: "done" as const, media_id: outcome.mediaId, error: null } : { state: outcome.state, error: outcome.error }),
      refresh_due_at: REFRESH_NOW,
      lease_token: null,
      updated_at: sql`now()`,
    })
    .where("owner_id", "=", j.owner_id)
    .where("ref", "=", j.ref)
    .where("state", "=", "running")
    .where("lease_token", "=", j.lease_token)
    .returning("refresh_due_at")
    .executeTakeFirst();
  return r?.refresh_due_at ?? null;
}

/** Takes the next settled job whose shares still need a refresh, leased for `leaseSeconds` (the new token). */
export async function claimMediaRefresh(db: Db, leaseSeconds: number): Promise<MediaJob | undefined> {
  const r = await sql<MediaJob>`
    UPDATE media_job j SET refresh_due_at = date_trunc('milliseconds', now() + make_interval(secs => ${leaseSeconds}))
    FROM (
      SELECT owner_id, ref FROM media_job
      WHERE refresh_due_at <= now() AND state IN ('done', 'failed', 'rejected')
      ORDER BY refresh_due_at LIMIT 1 FOR UPDATE SKIP LOCKED
    ) due
    WHERE j.owner_id = due.owner_id AND j.ref = due.ref
    RETURNING j.*`.execute(db);
  return r.rows[0];
}

/** The refresh for `token` is done (a newer settle keeps its own). */
export async function finishMediaRefresh(db: Db, j: Pick<MediaJob, "owner_id" | "ref">, token: Date): Promise<void> {
  await db.updateTable("media_job").set({ refresh_due_at: null }).where("owner_id", "=", j.owner_id).where("ref", "=", j.ref).where("refresh_due_at", "=", token).execute();
}

/** The refresh for `token` failed: due again after `seconds`. */
export async function deferMediaRefresh(db: Db, j: Pick<MediaJob, "owner_id" | "ref">, token: Date, seconds: number): Promise<void> {
  await db
    .updateTable("media_job")
    .set({ refresh_due_at: sql<Date>`now() + make_interval(secs => ${seconds})` })
    .where("owner_id", "=", j.owner_id)
    .where("ref", "=", j.ref)
    .where("refresh_due_at", "=", token)
    .execute();
}

/** Puts a running job back in the queue after a temporary problem; false when the lease was lost. */
export async function retryMediaJobLater(db: Db, j: MediaJobLease, delaySeconds: number, error: string): Promise<boolean> {
  return updateLeased(db, j, { state: "pending", error, run_after: sql`now() + make_interval(secs => ${delaySeconds})`, lease_token: null, updated_at: sql`now()` });
}

/** Gives a running job back untouched (worker shutting down): due at once, the attempt not counted; false when the lease was lost. */
export async function releaseMediaJob(db: Db, j: MediaJobLease): Promise<boolean> {
  return updateLeased(db, j, { state: "pending", attempts: sql`greatest(attempts - 1, 0)`, run_after: sql`now()`, lease_token: null, updated_at: sql`now()` });
}
