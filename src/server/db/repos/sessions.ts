import { sql } from "kysely";
import type { Db } from "../client";
import type { Profile } from "../schema";

export async function insertSession(db: Db, row: { idHash: string; userId: string; expiresAt: Date }): Promise<void> {
  await db.insertInto("web_session").values({ id_hash: row.idHash, user_id: row.userId, expires_at: row.expiresAt }).execute();
}

/** Live session joined with an active profile, or undefined. */
export async function findSessionProfile(db: Db, idHash: string): Promise<{ profile: Profile; lastSeenAt: Date } | undefined> {
  const row = await db
    .selectFrom("web_session as s")
    .innerJoin("profile as p", "p.user_id", "s.user_id")
    .selectAll("p")
    .select("s.last_seen_at")
    .where("s.id_hash", "=", idHash)
    .where("s.expires_at", ">", sql<Date>`now()`)
    .where("p.status", "=", "active")
    .executeTakeFirst();
  if (!row) return undefined;
  const { last_seen_at, ...profile } = row;
  return { profile, lastSeenAt: last_seen_at };
}

/** Sliding expiry. */
export async function touchSession(db: Db, idHash: string, expiresAt: Date): Promise<void> {
  await db.updateTable("web_session").set({ last_seen_at: new Date(), expires_at: expiresAt }).where("id_hash", "=", idHash).execute();
}

export async function deleteSession(db: Db, idHash: string): Promise<void> {
  await db.deleteFrom("web_session").where("id_hash", "=", idHash).execute();
}

export async function deleteSessionsOfUser(db: Db, userId: string): Promise<void> {
  await db.deleteFrom("web_session").where("user_id", "=", userId).execute();
}

export async function purgeExpiredSessions(db: Db): Promise<number> {
  const r = await db.deleteFrom("web_session").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  return Number(r.numDeletedRows);
}
