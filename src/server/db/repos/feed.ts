import { sql } from "kysely";
import type { Db } from "../client";
import type { Post, PostKind, PostRevision } from "../schema";

/** Keyset position in a newest-first feed. */
export type FeedCursor = { at: Date; id: string };

/** `query`: case-insensitive substring of the post text (site search). */
export type FeedFilter = { authorId?: string; kind?: PostKind; withCover?: boolean; query?: string; /** Home timeline: own posts + followed authors. */ followerId?: string };

/** LIKE pattern matching `text` literally anywhere. */
export const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type FeedRow = Post & { author_handle: string; author_name: string; author_avatar: string | null };

/** Live posts newest first (indexes: post_timeline_idx / post_author_published_idx). */
export async function listFeed(db: Db, filter: FeedFilter, cursor: FeedCursor | null, limit: number): Promise<FeedRow[]> {
  let q = db
    .selectFrom("post")
    .innerJoin("profile", "profile.user_id", "post.author_id")
    .selectAll("post")
    .select(["profile.handle as author_handle", "profile.display_name as author_name", "profile.avatar_url as author_avatar"])
    .where("post.status", "=", "active")
    .where("profile.status", "=", "active");
  if (filter.authorId) q = q.where("post.author_id", "=", filter.authorId);
  if (filter.followerId) {
    const me = filter.followerId;
    q = q.where((eb) => eb.or([eb("post.author_id", "=", me), eb("post.author_id", "in", eb.selectFrom("follow").select("followee_id").where("follower_id", "=", me))]));
  }
  if (filter.kind) q = q.where("post.kind", "=", filter.kind);
  if (filter.withCover) q = q.where("post.cover_media_id", "is not", null);
  if (filter.query) q = q.where("post.search_text", "ilike", containsPattern(filter.query));
  if (cursor) q = q.where(sql<boolean>`(post.published_at, post.id) < (${cursor.at}, ${cursor.id}::uuid)`);
  return q.orderBy("post.published_at", "desc").orderBy("post.id", "desc").limit(limit).execute();
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
