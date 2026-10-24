import { sql, type Selectable } from "kysely";
import type { Db } from "../client";
import type { AvatarJobTable } from "../schema-share";

export type AvatarJob = Selectable<AvatarJobTable>;

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
        created_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      }),
    )
    .execute();
}

export async function cancelAvatarJob(db: Db, userId: string): Promise<void> {
  await db.deleteFrom("avatar_job").where("user_id", "=", userId).where("state", "in", ["pending", "running"]).execute();
}

/** Next due avatar download (or one whose worker died), leased for `leaseSeconds`. */
export async function claimAvatarJob(db: Db, leaseSeconds: number): Promise<AvatarJob | undefined> {
  const r = await sql<AvatarJob>`
    UPDATE avatar_job a SET state = 'running', attempts = a.attempts + 1, run_after = now() + make_interval(secs => ${leaseSeconds}), updated_at = now()
    FROM (SELECT user_id FROM avatar_job WHERE state IN ('pending', 'running') AND run_after <= now() ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED) due
    WHERE a.user_id = due.user_id
    RETURNING a.*`.execute(db);
  return r.rows[0];
}

/** Outcome for the claimed source (a job replaced meanwhile by a newer source is left alone). */
export async function settleAvatarJob(db: Db, job: Pick<AvatarJob, "user_id" | "source_url">, outcome: { state: "done" } | { state: "failed"; error: string } | { retryInSeconds: number; error: string }): Promise<void> {
  const set =
    "retryInSeconds" in outcome
      ? { state: "pending" as const, error: outcome.error, run_after: sql<Date>`now() + make_interval(secs => ${outcome.retryInSeconds})`, updated_at: sql<Date>`now()` }
      : { state: outcome.state, error: outcome.state === "failed" ? outcome.error : null, updated_at: sql<Date>`now()` };
  await db.updateTable("avatar_job").set(set).where("user_id", "=", job.user_id).where("source_url", "=", job.source_url).where("state", "=", "running").execute();
}
