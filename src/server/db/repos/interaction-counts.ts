import { sql } from "kysely";
import type { Db } from "../client";

export type CounterTargets = { postIds: string[]; commentIds: string[] };

/** Posts and comments whose counters include this user's likes, bookmarks or comments. */
export async function countersTouchedBy(db: Db, userId: string): Promise<CounterTargets> {
  const posts = await sql<{ id: string }>`
    SELECT post_id AS id FROM post_like WHERE user_id = ${userId}
    UNION SELECT post_id FROM post_bookmark WHERE user_id = ${userId}
    UNION SELECT post_id FROM comment WHERE author_id = ${userId}`.execute(db);
  const comments = await db.selectFrom("comment_like").select("comment_id").where("user_id", "=", userId).execute();
  return { postIds: posts.rows.map((r) => r.id), commentIds: comments.map((r) => r.comment_id) };
}

/**
 * Recounts likes, visible comments and bookmarks of the given posts and likes of the given comments from
 * their rows — after rows went away by cascade (a deleted account), which the running counters do not see.
 */
export async function recountCounters(db: Db, t: CounterTargets): Promise<void> {
  if (t.postIds.length) {
    await sql`
      UPDATE post p SET
        like_count = (SELECT count(*) FROM post_like l WHERE l.post_id = p.id),
        comment_count = (SELECT count(*) FROM comment c WHERE c.post_id = p.id AND c.status = 'visible'),
        bookmark_count = (SELECT count(*) FROM post_bookmark b WHERE b.post_id = p.id)
      WHERE p.id IN (${sql.join(t.postIds.map((id) => sql`${id}::uuid`))})`.execute(db);
  }
  if (t.commentIds.length) {
    await sql`
      UPDATE comment c SET like_count = (SELECT count(*) FROM comment_like l WHERE l.comment_id = c.id)
      WHERE c.id IN (${sql.join(t.commentIds.map((id) => sql`${id}::uuid`))})`.execute(db);
  }
}
