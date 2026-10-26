import { sql } from "kysely";
import type { Db } from "../client";
import type { Media } from "../schema";

/** Pending check: due now, unless a lease or retry delay already holds it later. */
const DUE_NOW = sql<Date>`CASE WHEN visibility_due_at > now() THEN visibility_due_at ELSE now() END`;

/** Marks media for a visibility check (call in the transaction that changed their references). */
export async function requestVisibilityCheck(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.updateTable("media").set({ visibility_due_at: DUE_NOW }).where("id", "in", [...new Set(ids)]).execute();
}

/**
 * Leases media for a move into the public store: checks stay away until `until` (waits for a check
 * running now). Returns the ids whose lease is ours (another, later lease is left alone).
 */
export async function leaseVisibility(db: Db, ids: string[], seconds: number): Promise<{ until: Date; owned: string[] }> {
  const until = new Date(Date.now() + seconds * 1000);
  if (ids.length === 0) return { until, owned: [] };
  const rows = await db
    .updateTable("media")
    .set({ visibility_due_at: sql<Date>`greatest(coalesce(visibility_due_at, ${until}), ${until})` })
    .where("id", "in", [...new Set(ids)])
    .returning(["id", "visibility_due_at"])
    .execute();
  return { until, owned: rows.filter((r) => r.visibility_due_at?.getTime() === until.getTime()).map((r) => r.id) };
}

/** Ends our lease: the media are due for a check now. */
export async function releaseVisibilityLease(db: Db, ids: string[], until: Date): Promise<void> {
  if (ids.length === 0) return;
  await db.updateTable("media").set({ visibility_due_at: sql<Date>`now()` }).where("id", "in", ids).where("visibility_due_at", "=", until).execute();
}

/** Locks a media whose check is due now (skipped while another check holds it). */
export async function lockDueMedia(trx: Db, id: string): Promise<Media | undefined> {
  return trx.selectFrom("media").selectAll().where("id", "=", id).where("visibility_due_at", "<=", sql<Date>`now()`).forUpdate().skipLocked().executeTakeFirst();
}

/** Whether the current revision of an active post of an active author uses the media; and of any post. */
export async function mediaReferences(db: Db, id: string): Promise<{ live: boolean; referenced: boolean }> {
  const row = await db
    .selectFrom("revision_media as rm")
    .innerJoin("post as p", "p.current_revision_id", "rm.revision_id")
    .innerJoin("profile as a", "a.user_id", "p.author_id")
    .select(sql<boolean>`bool_or(p.status = 'active' AND a.status = 'active')`.as("live"))
    .where("rm.media_id", "=", id)
    .executeTakeFirst();
  return { live: row?.live === true, referenced: row?.live !== null && row?.live !== undefined };
}

/** Records the checked state (objects moved accordingly) and clears the check. */
export async function settleVisibility(trx: Db, id: string, s: { live: boolean; referenced: boolean }): Promise<void> {
  await trx
    .updateTable("media")
    .set({
      public_at: s.live ? sql<Date>`coalesce(public_at, now())` : null,
      // Used by no post at all: the 7-day clock before physical deletion starts.
      detached_at: s.live ? null : s.referenced ? sql<Date>`detached_at` : sql<Date>`coalesce(detached_at, now())`,
      visibility_due_at: null,
    })
    .where("id", "=", id)
    .execute();
}

/** A failed check is retried after `seconds` (unless something made it due again meanwhile). */
export async function deferVisibility(db: Db, id: string, seconds: number): Promise<void> {
  await db
    .updateTable("media")
    .set({ visibility_due_at: sql<Date>`now() + make_interval(secs => ${seconds})` })
    .where("id", "=", id)
    .where("visibility_due_at", "<=", sql<Date>`now()`)
    .execute();
}

export async function listDueVisibility(db: Db, limit: number): Promise<string[]> {
  const rows = await db.selectFrom("media").select("id").where("visibility_due_at", "<=", sql<Date>`now()`).orderBy("visibility_due_at").limit(limit).execute();
  return rows.map((r) => r.id);
}

export async function nextVisibilityDueAt(db: Db): Promise<Date | null> {
  const r = await db.selectFrom("media").select((eb) => eb.fn.min("visibility_due_at").as("at")).executeTakeFirst();
  return r?.at ?? null;
}
