import { sql } from "kysely";
import type { Db } from "../client";
import type { FeedCursor, FeedRow } from "./feed";

/** Reposts a post for the user and bumps its counter; returns the new count. Idempotent. */
export async function addRepost(db: Db, userId: string, postId: string): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const inserted = await trx.insertInto("post_repost").values({ user_id: userId, post_id: postId }).onConflict((oc) => oc.doNothing()).executeTakeFirst();
    const delta = Number(inserted.numInsertedOrUpdatedRows ?? 0);
    const row = await trx.updateTable("post").set({ repost_count: sql`repost_count + ${delta}` }).where("id", "=", postId).returning("repost_count").executeTakeFirst();
    return row?.repost_count ?? 0;
  });
}

/** Undoes the user's repost; returns the new count. Idempotent. */
export async function removeRepost(db: Db, userId: string, postId: string): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const deleted = await trx.deleteFrom("post_repost").where("user_id", "=", userId).where("post_id", "=", postId).executeTakeFirst();
    const delta = Number(deleted.numDeletedRows ?? 0);
    const row = await trx.updateTable("post").set({ repost_count: sql`greatest(repost_count - ${delta}, 0)` }).where("id", "=", postId).returning("repost_count").executeTakeFirst();
    return row?.repost_count ?? 0;
  });
}

/** Which of the given posts the user reposted (page rendering). */
export async function repostedAmong(db: Db, userId: string | null, postIds: string[]): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();
  const rows = await db.selectFrom("post_repost").select("post_id").where("user_id", "=", userId).where("post_id", "in", postIds).execute();
  return new Set(rows.map((r) => r.post_id));
}

/** Live public quotes of each given post (added to the repost count shown). */
export async function liveQuoteCounts(db: Db, postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("post as q")
    .innerJoin("profile as a", "a.user_id", "q.author_id")
    .select(["q.quote_of as id", sql<number>`count(*)::int`.as("n")])
    .where("q.quote_of", "in", postIds)
    .where("q.status", "=", "active")
    .where("q.visibility", "=", "public")
    .where("a.status", "=", "active")
    .groupBy("q.quote_of")
    .execute();
  return new Map(rows.map((r) => [r.id!, r.n]));
}

/**
 * A profile's "Reposts" tab: its plain reposts (of live public posts) and its quotes (own private ones
 * only on the owner's view), newest first by repost / publishing time (keyset on that time + post id).
 */
export async function listProfileReposts(db: Db, userId: string, includePrivate: boolean, cursor: FeedCursor | null, limit: number): Promise<FeedRow[]> {
  const before = (at: unknown, id: unknown) => (cursor ? sql`AND (${at}, ${id}) < (${cursor.at}, ${cursor.id}::uuid)` : sql``);
  const quoteVisibility = includePrivate ? sql`` : sql`AND p.visibility = 'public'`;
  const rows = await sql<FeedRow>`
    WITH items AS (
      (SELECT r.post_id AS id, r.created_at AS at, true AS plain FROM post_repost r
        JOIN post p ON p.id = r.post_id JOIN profile pa ON pa.user_id = p.author_id
        WHERE r.user_id = ${userId} AND p.status = 'active' AND p.visibility = 'public' AND pa.status = 'active' ${before(sql`r.created_at`, sql`r.post_id`)}
        ORDER BY r.created_at DESC, r.post_id DESC LIMIT ${limit})
      UNION ALL
      (SELECT p.id, p.published_at AS at, false AS plain FROM post p
        WHERE p.author_id = ${userId} AND p.quote_of IS NOT NULL AND p.status = 'active' ${quoteVisibility} ${before(sql`p.published_at`, sql`p.id`)}
        ORDER BY p.published_at DESC, p.id DESC LIMIT ${limit})
    )
    SELECT post.*, profile.handle AS author_handle, profile.display_name AS author_name, profile.avatar_url AS author_avatar,
      items.at AS feed_at, CASE WHEN items.plain THEN rb.handle END AS reposter_handle, CASE WHEN items.plain THEN rb.display_name END AS reposter_name
    FROM items
    JOIN post ON post.id = items.id
    JOIN profile ON profile.user_id = post.author_id
    JOIN profile rb ON rb.user_id = ${userId}
    WHERE profile.status = 'active'
    ORDER BY items.at DESC, items.id DESC
    LIMIT ${limit}`.execute(db);
  return rows.rows;
}
