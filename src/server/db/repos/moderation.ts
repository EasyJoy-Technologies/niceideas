import { sql } from "kysely";
import type { Db } from "../client";
import type { ModerationActionKind, Report } from "../schema";

export async function recordModeration(
  db: Db,
  row: { action: ModerationActionKind; actorId: string; reason: string; postId?: string | null; commentId?: string | null; detail?: string },
): Promise<void> {
  await db
    .insertInto("moderation_action")
    .values({ action: row.action, actor_id: row.actorId, reason: row.reason, post_id: row.postId ?? null, comment_id: row.commentId ?? null, detail: row.detail ?? "" })
    .execute();
}

export async function isBanned(db: Db, keys: { visitorKey: string | null; ipHash: string }): Promise<boolean> {
  const row = await db
    .selectFrom("visitor_ban")
    .select("key_hash")
    .where((eb) =>
      eb.or([
        eb.and([eb("kind", "=", "ip"), eb("key_hash", "=", keys.ipHash)]),
        ...(keys.visitorKey ? [eb.and([eb("kind", "=", "visitor"), eb("key_hash", "=", keys.visitorKey)])] : []),
      ]),
    )
    .where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", sql<Date>`now()`)]))
    .executeTakeFirst();
  return !!row;
}

export async function upsertBan(db: Db, ban: { kind: "visitor" | "ip"; keyHash: string; reason: string; createdBy: string; expiresAt: Date | null }): Promise<void> {
  await db
    .insertInto("visitor_ban")
    .values({ kind: ban.kind, key_hash: ban.keyHash, reason: ban.reason, created_by: ban.createdBy, expires_at: ban.expiresAt })
    .onConflict((oc) => oc.columns(["kind", "key_hash"]).doUpdateSet({ reason: ban.reason, created_by: ban.createdBy, expires_at: ban.expiresAt }))
    .execute();
}

export async function deleteBan(db: Db, kind: "visitor" | "ip", keyHash: string): Promise<number> {
  const r = await db.deleteFrom("visitor_ban").where("kind", "=", kind).where("key_hash", "=", keyHash).executeTakeFirst();
  return Number(r.numDeletedRows);
}

export type NewReport = { postId: string; commentId: string | null; reason: string; detail: string; reporterId: string | null; reporterKey: string; ipHash: string };

/** One open report per reporter and target; repeats are accepted silently. */
export async function insertReport(db: Db, r: NewReport): Promise<void> {
  await sql`
    INSERT INTO report (post_id, comment_id, reason, detail, reporter_id, reporter_key, ip_hash)
    VALUES (${r.postId}, ${r.commentId}, ${r.reason}, ${r.detail}, ${r.reporterId}, ${r.reporterKey}, ${r.ipHash})
    ON CONFLICT DO NOTHING`.execute(db);
}

export async function countReportsByIpSince(db: Db, ipHash: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("report")
    .select(sql<string>`count(*)`.as("n"))
    .where("ip_hash", "=", ipHash)
    .where("created_at", ">", sql<Date>`now() - make_interval(secs => ${seconds})`)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function listOpenReports(db: Db, limit: number): Promise<Report[]> {
  return db.selectFrom("report").selectAll().where("status", "=", "open").orderBy("created_at", "asc").limit(limit).execute();
}

export async function closeReport(db: Db, id: string, status: "resolved" | "dismissed", by: string): Promise<Report | undefined> {
  return db
    .updateTable("report")
    .set({ status, resolved_at: new Date(), resolved_by: by })
    .where("id", "=", id)
    .where("status", "=", "open")
    .returningAll()
    .executeTakeFirst();
}
