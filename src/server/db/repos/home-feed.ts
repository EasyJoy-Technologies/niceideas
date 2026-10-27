import { sql } from "kysely";
import type { Db } from "../client";
import type { PostKind } from "../schema";
import type { FeedCursor, FeedRow } from "./feed";

/**
 * Home timeline: posts of the user and the accounts they follow, plus posts those accounts reposted
 * (shown with "X reposted"). Every post appears once, at its newest occurrence (its publishing or the
 * newest repost), so the keyset cursor is on that time. Each account's newest `limit` posts and reposts
 * are read through post_author_published_idx / post_repost_user_recent_idx and merged, so the cost depends
 * on the number of followed accounts, not on how rare their posts are in the global timeline.
 * Validity (live, public, author active, tab kind) is checked inside the per-account reads, so a page never
 * passes over a valid item hidden behind invalid ones.
 */
export async function listHomeFeed(db: Db, me: string, kind: PostKind | null, cursor: FeedCursor | null, limit: number): Promise<FeedRow[]> {
  const kindOk = kind ? sql`AND p.kind = ${kind}` : sql``;
  const before = (at: unknown, id: unknown) => (cursor ? sql`AND (${at}, ${id}) < (${cursor.at}, ${cursor.id}::uuid)` : sql``);
  // A post already shown on an earlier page (an occurrence at or after the cursor) is not shown again.
  const notShown = cursor
    ? sql`AND NOT EXISTS (SELECT 1 FROM post_repost r2 JOIN au ON au.a = r2.user_id
          WHERE r2.post_id = best.id AND (r2.created_at, r2.post_id) >= (${cursor.at}, ${cursor.id}::uuid))
        AND NOT (post.author_id IN (SELECT a FROM au) AND (post.published_at, post.id) >= (${cursor.at}, ${cursor.id}::uuid))`
    : sql``;
  const rows = await sql<FeedRow>`
    WITH au AS (
      SELECT f.followee_id AS a FROM follow f JOIN profile fp ON fp.user_id = f.followee_id AND fp.status = 'active' WHERE f.follower_id = ${me}
      UNION SELECT ${me}::text
    ),
    own AS (
      SELECT x.id, x.published_at AS at, NULL::text AS by FROM au CROSS JOIN LATERAL (
        SELECT p.id, p.published_at FROM post p
        WHERE p.author_id = au.a AND p.status = 'active' AND p.visibility = 'public' ${kindOk} ${before(sql`p.published_at`, sql`p.id`)}
        ORDER BY p.published_at DESC, p.id DESC LIMIT ${limit}) x
    ),
    rp AS (
      SELECT x.post_id AS id, x.created_at AS at, au.a AS by FROM au CROSS JOIN LATERAL (
        SELECT r.post_id, r.created_at FROM post_repost r
        JOIN post p ON p.id = r.post_id JOIN profile pa ON pa.user_id = p.author_id
        WHERE r.user_id = au.a AND p.status = 'active' AND p.visibility = 'public' AND pa.status = 'active' ${kindOk} ${before(sql`r.created_at`, sql`r.post_id`)}
        ORDER BY r.created_at DESC, r.post_id DESC LIMIT ${limit}) x
    ),
    best AS (
      SELECT DISTINCT ON (id) id, at, by FROM (SELECT * FROM own UNION ALL SELECT * FROM rp) items ORDER BY id, at DESC, by NULLS FIRST
    )
    SELECT post.*, profile.handle AS author_handle, profile.display_name AS author_name, profile.avatar_url AS author_avatar,
      best.at AS feed_at, rb.handle AS reposter_handle, rb.display_name AS reposter_name
    FROM best
    JOIN post ON post.id = best.id
    JOIN profile ON profile.user_id = post.author_id
    LEFT JOIN profile rb ON rb.user_id = best.by
    WHERE profile.status = 'active' ${notShown}
    ORDER BY best.at DESC, best.id DESC
    LIMIT ${limit}`.execute(db);
  return rows.rows;
}
