import { sql } from "kysely";
import type { Db } from "../client";

export type LikeTarget = { table: "post_like"; column: "post_id"; parent: "post" } | { table: "comment_like"; column: "comment_id"; parent: "comment" };
export const POST_LIKE: LikeTarget = { table: "post_like", column: "post_id", parent: "post" };
export const COMMENT_LIKE: LikeTarget = { table: "comment_like", column: "comment_id", parent: "comment" };

type Liker = { likerKey: string; userId: string | null; ipHash: string };

/** Adds a like and bumps the counter in one statement pair; returns the new count. Idempotent. */
export async function addLike(db: Db, target: LikeTarget, id: string, liker: Liker): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const inserted = await sql<{ n: number }>`
      INSERT INTO ${sql.table(target.table)} (${sql.ref(target.column)}, liker_key, user_id, ip_hash)
      VALUES (${id}, ${liker.likerKey}, ${liker.userId}, ${liker.ipHash})
      ON CONFLICT DO NOTHING RETURNING 1 AS n`.execute(trx);
    const delta = inserted.rows.length;
    const row = await sql<{ like_count: number }>`
      UPDATE ${sql.table(target.parent)} SET like_count = like_count + ${delta} WHERE id = ${id} RETURNING like_count`.execute(trx);
    return row.rows[0]?.like_count ?? 0;
  });
}

export async function removeLike(db: Db, target: LikeTarget, id: string, likerKey: string): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const deleted = await sql`
      DELETE FROM ${sql.table(target.table)} WHERE ${sql.ref(target.column)} = ${id} AND liker_key = ${likerKey} RETURNING 1`.execute(trx);
    const delta = deleted.rows.length;
    const row = await sql<{ like_count: number }>`
      UPDATE ${sql.table(target.parent)} SET like_count = greatest(like_count - ${delta}, 0) WHERE id = ${id} RETURNING like_count`.execute(trx);
    return row.rows[0]?.like_count ?? 0;
  });
}

/** Which of the given targets this liker has liked (page rendering). */
export async function likedAmong(db: Db, target: LikeTarget, ids: string[], likerKey: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sql<{ id: string }>`
    SELECT ${sql.ref(target.column)} AS id FROM ${sql.table(target.table)}
    WHERE liker_key = ${likerKey} AND ${sql.ref(target.column)} IN (${sql.join(ids)})`.execute(db);
  return new Set(rows.rows.map((r) => r.id));
}

export async function countLikesByIpSince(db: Db, ipHash: string, seconds: number): Promise<number> {
  const rows = await sql<{ n: string }>`
    SELECT (SELECT count(*) FROM post_like WHERE ip_hash = ${ipHash} AND created_at > now() - make_interval(secs => ${seconds}))
         + (SELECT count(*) FROM comment_like WHERE ip_hash = ${ipHash} AND created_at > now() - make_interval(secs => ${seconds})) AS n`.execute(db);
  return Number(rows.rows[0]?.n ?? 0);
}
