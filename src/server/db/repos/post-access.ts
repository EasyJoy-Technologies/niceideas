import { sql, type RawBuilder } from "kysely";

/**
 * Who may see a post, as a SQL condition for lists (the single-post rule is posts/visibility.ts; keep them
 * in step): public posts; followers-only posts for the author's followers; friends-only posts for mutual
 * follows; the viewer's own posts (their private ones only with `ownPrivate`). Signed out: public only.
 * `alias`: the post table's name or alias in the query. Follow checks use the follow primary key.
 */
export function visibleTo(alias: string, viewerId: string | null, opts: { ownPrivate?: boolean } = {}): RawBuilder<boolean> {
  const vis = sql.ref(`${alias}.visibility`);
  if (!viewerId) return sql<boolean>`(${vis} = 'public')`;
  const author = sql.ref(`${alias}.author_id`);
  const own = opts.ownPrivate ? sql`${author} = ${viewerId}` : sql`(${author} = ${viewerId} AND ${vis} <> 'private')`;
  return sql<boolean>`(${vis} = 'public' OR ${own}
    OR (${vis} IN ('followers', 'friends')
      AND EXISTS (SELECT 1 FROM follow fa WHERE fa.follower_id = ${viewerId} AND fa.followee_id = ${author})
      AND (${vis} = 'followers' OR EXISTS (SELECT 1 FROM follow fb WHERE fb.follower_id = ${author} AND fb.followee_id = ${viewerId}))))`;
}
