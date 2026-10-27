import { sql } from "kysely";
import type { Db } from "../client";
import type { FeedCursor } from "./feed";

/** One of an account's comments with the post it is on (profile "Replies" tab). */
export type UserReplyRow = {
  id: string;
  body: string;
  created_at: Date;
  like_count: number;
  /** Whom it answers: the comment it replies to (its author or guest name), else the post's author. */
  to_handle: string | null;
  to_name: string | null;
  post_id: string;
  post_slug: string;
  post_kind: "short" | "article";
  post_title: string;
  post_summary: string;
  post_published_at: Date;
  post_cover_media_id: string | null;
  post_author_handle: string;
  post_author_name: string;
  post_author_avatar: string | null;
};

/**
 * The account's visible comments, newest first (keyset on time + id; comment_author_recent_idx), on posts
 * everyone can see now (live, public, author active). Guest comments are not tied to an account.
 */
export async function listUserReplies(db: Db, userId: string, cursor: FeedCursor | null, limit: number): Promise<UserReplyRow[]> {
  return db
    .selectFrom("comment as c")
    .innerJoin("post as p", "p.id", "c.post_id")
    .innerJoin("profile as pa", "pa.user_id", "p.author_id")
    .leftJoin("comment as parent", "parent.id", "c.parent_id")
    .leftJoin("profile as parent_author", "parent_author.user_id", "parent.author_id")
    .select([
      "c.id", "c.body", "c.created_at", "c.like_count",
      sql<string | null>`CASE WHEN c.parent_id IS NULL THEN pa.handle ELSE parent_author.handle END`.as("to_handle"),
      sql<string | null>`CASE WHEN c.parent_id IS NULL THEN pa.display_name ELSE coalesce(parent_author.display_name, parent.anon_name) END`.as("to_name"),
      "p.id as post_id", "p.slug as post_slug", "p.kind as post_kind", "p.title as post_title", "p.summary as post_summary",
      "p.published_at as post_published_at", "p.cover_media_id as post_cover_media_id",
      "pa.handle as post_author_handle", "pa.display_name as post_author_name", "pa.avatar_url as post_author_avatar",
    ])
    .where("c.author_id", "=", userId)
    .where("c.status", "=", "visible")
    .where("p.status", "=", "active")
    .where("p.visibility", "=", "public")
    .where("pa.status", "=", "active")
    .$if(!!cursor, (q) => q.where(sql<boolean>`(c.created_at, c.id) < (${cursor!.at}, ${cursor!.id}::uuid)`))
    .orderBy("c.created_at", "desc")
    .orderBy("c.id", "desc")
    .limit(limit)
    .execute();
}
