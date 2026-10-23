import { sql, type RawBuilder, type SelectQueryBuilder } from "kysely";
import type { Db } from "../client";
import type { Database, Post, PostKind, PostRevision } from "../schema";

/** Keyset position in a newest-first feed. */
export type FeedCursor = { at: Date; id: string };

/** `query`: case-insensitive substring of the post text (site search). */
export type FeedFilter = { authorId?: string; kind?: PostKind; query?: string; /** Home timeline: own posts + followed authors. */ followerId?: string };

/** LIKE pattern matching `text` literally anywhere. */
export const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type FeedRow = Post & { author_handle: string; author_name: string; author_avatar: string | null };

/** Live posts newest first (indexes: post_timeline_idx / post_author_published_idx). */
export async function listFeed(db: Db, filter: FeedFilter, cursor: FeedCursor | null, limit: number): Promise<FeedRow[]> {
  if (filter.followerId) return listHomeFeed(db, filter.followerId, filter, cursor, limit);
  let q = db.selectFrom("post");
  if (filter.authorId) q = q.where("post.author_id", "=", filter.authorId);
  if (filter.query) q = q.where("post.search_text", "ilike", containsPattern(filter.query));
  return withAuthor(q.where(feedConditions(filter, cursor))).orderBy("post.published_at", "desc").orderBy("post.id", "desc").limit(limit).execute();
}

/**
 * Home timeline: own posts + followed authors. Reads the newest `limit` posts of each
 * author through post_author_published_idx and merges them, so the cost depends on the
 * number of followed authors, not on how rare their posts are in the global timeline.
 */
async function listHomeFeed(db: Db, me: string, filter: FeedFilter, cursor: FeedCursor | null, limit: number): Promise<FeedRow[]> {
  const authors = db
    .selectFrom("follow")
    .select("followee_id as a")
    .where("follower_id", "=", me)
    .unionAll(db.selectNoFrom(sql<string>`${me}::text`.as("a")))
    .as("au");
  return db
    .selectFrom(authors)
    .innerJoinLateral(
      (eb) => eb.selectFrom("post").whereRef("post.author_id", "=", "au.a").where(feedConditions(filter, cursor)).selectAll("post").orderBy("post.published_at", "desc").orderBy("post.id", "desc").limit(limit).as("post"),
      (join) => join.onTrue(),
    )
    .innerJoin("profile", "profile.user_id", "post.author_id")
    .selectAll("post")
    .select(["profile.handle as author_handle", "profile.display_name as author_name", "profile.avatar_url as author_avatar"])
    .where("profile.status", "=", "active")
    .orderBy("post.published_at", "desc")
    .orderBy("post.id", "desc")
    .limit(limit)
    .execute();
}

type PostQuery = SelectQueryBuilder<Database, "post", object>;

/** Conditions shared by every feed: live posts, kind tab, keyset cursor. */
function feedConditions(filter: FeedFilter, cursor: FeedCursor | null): RawBuilder<boolean> {
  const parts: RawBuilder<unknown>[] = [sql`post.status = 'active'`];
  if (filter.kind) parts.push(sql`post.kind = ${filter.kind}`);
  if (cursor) parts.push(sql`(post.published_at, post.id) < (${cursor.at}, ${cursor.id}::uuid)`);
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

function withAuthor(q: PostQuery) {
  return q
    .innerJoin("profile", "profile.user_id", "post.author_id")
    .selectAll("post")
    .select(["profile.handle as author_handle", "profile.display_name as author_name", "profile.avatar_url as author_avatar"])
    .where("profile.status", "=", "active");
}

export async function findRevisions(db: Db, ids: string[]): Promise<PostRevision[]> {
  return ids.length ? db.selectFrom("post_revision").selectAll().where("id", "in", ids).execute() : [];
}

export type ProfileStats = { posts: number; likes: number; followers: number; following: number };

export async function profileStats(db: Db, userId: string): Promise<ProfileStats> {
  const [posts, followers, following] = await Promise.all([
    db
      .selectFrom("post")
      .select([sql<number>`count(*)::int`.as("n"), sql<number>`coalesce(sum(like_count), 0)::int`.as("likes")])
      .where("author_id", "=", userId)
      .where("status", "=", "active")
      .executeTakeFirstOrThrow(),
    db.selectFrom("follow").select(sql<number>`count(*)::int`.as("n")).where("followee_id", "=", userId).executeTakeFirstOrThrow(),
    db.selectFrom("follow").select(sql<number>`count(*)::int`.as("n")).where("follower_id", "=", userId).executeTakeFirstOrThrow(),
  ]);
  return { posts: posts.n, likes: posts.likes, followers: followers.n, following: following.n };
}
