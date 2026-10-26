import { sql, type Selectable } from "kysely";
import type { Db } from "../client";
import type { AvatarJobTable } from "../schema-share";

export type AvatarJob = Selectable<AvatarJobTable>;
/** A claimed job: writes of the claim apply only while its `lease_token` holds the lease (F13). */
export type AvatarJobLease = Pick<AvatarJob, "user_id" | "source_url" | "lease_token">;

/** Queues the download of a user's NiceMatrix avatar; a new source replaces a waiting or finished job. */
export async function queueAvatarJob(db: Db, userId: string, sourceUrl: string): Promise<void> {
  await db
    .insertInto("avatar_job")
    .values({ user_id: userId, source_url: sourceUrl })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        source_url: sourceUrl,
        state: "pending",
        attempts: 0,
        error: null,
        run_after: sql<Date>`now()`,
        lease_token: null,
        created_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      }),
    )
    .execute();
}

export async function cancelAvatarJob(db: Db, userId: string): Promise<void> {
  await db.deleteFrom("avatar_job").where("user_id", "=", userId).where("state", "in", ["pending", "running"]).execute();
}

/** Next due avatar download (or one whose worker died), leased for `leaseSeconds` under a new lease token. */
export async function claimAvatarJob(db: Db, leaseSeconds: number): Promise<AvatarJob | undefined> {
  const r = await sql<AvatarJob>`
    UPDATE avatar_job a SET state = 'running', attempts = a.attempts + 1, run_after = now() + make_interval(secs => ${leaseSeconds}), lease_token = gen_random_uuid(), updated_at = now()
    FROM (SELECT user_id FROM avatar_job WHERE state IN ('pending', 'running') AND run_after <= now() ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED) due
    WHERE a.user_id = due.user_id
    RETURNING a.*`.execute(db);
  return r.rows[0];
}

/** When the next avatar job falls due (same filter as `claimAvatarJob`); null when none is waiting. */
export async function nextAvatarJobDueAt(db: Db): Promise<Date | null> {
  const r = await db.selectFrom("avatar_job").select((eb) => eb.fn.min("run_after").as("at")).where("state", "in", ["pending", "running"]).executeTakeFirst();
  return r?.at ?? null;
}

/**
 * Outcome for the claimed source, only while the claim still holds its lease. A job replaced meanwhile
 * (new source, or cancelled) is left alone (`replaced`); one claimed again by another worker after the
 * lease ran out too (`lost`).
 */
export async function settleAvatarJob(
  db: Db,
  job: AvatarJobLease,
  outcome: { state: "done" } | { state: "failed"; error: string } | { retryInSeconds: number; error: string },
): Promise<"settled" | "replaced" | "lost"> {
  const set =
    "retryInSeconds" in outcome
      ? { state: "pending" as const, error: outcome.error, run_after: sql<Date>`now() + make_interval(secs => ${outcome.retryInSeconds})`, lease_token: null, updated_at: sql<Date>`now()` }
      : { state: outcome.state, error: outcome.state === "failed" ? outcome.error : null, lease_token: null, updated_at: sql<Date>`now()` };
  const r = await db
    .updateTable("avatar_job")
    .set(set)
    .where("user_id", "=", job.user_id)
    .where("source_url", "=", job.source_url)
    .where("state", "=", "running")
    .where("lease_token", "=", job.lease_token)
    .executeTakeFirst();
  if (Number(r.numUpdatedRows ?? 0) > 0) return "settled";
  const now = await db.selectFrom("avatar_job").select("source_url").where("user_id", "=", job.user_id).executeTakeFirst();
  return now?.source_url === job.source_url ? "lost" : "replaced";
}

/**
 * Points the profile at `url` if it still follows the job's source and the claim still holds its
 * lease (the job row is locked meanwhile, so it cannot be claimed again in between); true when it did.
 */
export async function setAvatarLeased(db: Db, job: AvatarJobLease, source: string | null, url: string | null): Promise<boolean> {
  const r = await db
    .updateTable("profile")
    .set({ avatar_url: url, updated_at: new Date() })
    .where("user_id", "=", job.user_id)
    .where((eb) => (source === null ? eb("avatar_source", "is", null) : eb("avatar_source", "=", source)))
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom("avatar_job")
          .select(sql`1`.as("x"))
          .where("user_id", "=", job.user_id)
          .where("state", "=", "running")
          .where("lease_token", "=", job.lease_token)
          .forShare(),
      ),
    )
    .executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0) > 0;
}
