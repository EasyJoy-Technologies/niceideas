import { sql } from "kysely";
import type { Db } from "../client";
import type { Comment, CommentStatus, NewComment } from "../schema";

export type CommentRow = Comment & { author_handle: string | null; author_name: string | null; author_avatar: string | null };

const withAuthor = (db: Db) =>
  db
    .selectFrom("comment")
    .leftJoin("profile", "profile.user_id", "comment.author_id")
    .selectAll("comment")
    .select(["profile.handle as author_handle", "profile.display_name as author_name", "profile.avatar_url as author_avatar"]);

export async function insertComment(db: Db, row: NewComment): Promise<Comment> {
  return db.transaction().execute(async (trx) => {
    const c = await trx.insertInto("comment").values(row).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable("post").set({ comment_count: sql`comment_count + 1` }).where("id", "=", row.post_id).execute();
    return c;
  });
}

export async function findComment(db: Db, id: string): Promise<Comment | undefined> {
  return db.selectFrom("comment").selectAll().where("id", "=", id).executeTakeFirst();
}

/** Visible top-level comments, oldest first (offset paging; pages are small). */
export async function listTopLevel(db: Db, postId: string, limit: number, offset: number): Promise<CommentRow[]> {
  return withAuthor(db)
    .where("comment.post_id", "=", postId)
    .where("comment.parent_id", "is", null)
    .where("comment.status", "=", "visible")
    .orderBy("comment.created_at", "asc")
    .orderBy("comment.id", "asc")
    .limit(limit)
    .offset(offset)
    .execute();
}

/** Visible replies of the given top-level comments, oldest first. */
export async function listReplies(db: Db, parentIds: string[]): Promise<CommentRow[]> {
  if (parentIds.length === 0) return [];
  return withAuthor(db)
    .where("comment.parent_id", "in", parentIds)
    .where("comment.status", "=", "visible")
    .orderBy("comment.created_at", "asc")
    .execute();
}

export async function countVisibleTopLevel(db: Db, postId: string): Promise<number> {
  const row = await db
    .selectFrom("comment")
    .select(sql<string>`count(*)`.as("n"))
    .where("post_id", "=", postId)
    .where("parent_id", "is", null)
    .where("status", "=", "visible")
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/**
 * Changes a comment's status and keeps `post.comment_count` equal to the number
 * of visible comments (replies of a hidden parent stay counted: they are not shown,
 * but restoring the parent brings them back).
 */
export async function setCommentStatus(db: Db, id: string, status: CommentStatus): Promise<Comment | undefined> {
  return db.transaction().execute(async (trx) => {
    const before = await trx.selectFrom("comment").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    if (!before || before.status === status) return before;
    const delta = (status === "visible" ? 1 : 0) - (before.status === "visible" ? 1 : 0);
    const after = await trx.updateTable("comment").set({ status }).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
    if (delta !== 0) {
      await trx.updateTable("post").set({ comment_count: sql`greatest(comment_count + ${delta}, 0)` }).where("id", "=", before.post_id).execute();
    }
    return after;
  });
}

export async function countCommentsSince(db: Db, column: "ip_hash" | "visitor_key", value: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("comment")
    .select(sql<string>`count(*)`.as("n"))
    .where(column, "=", value)
    .where("created_at", ">", sql<Date>`now() - make_interval(secs => ${seconds})`)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Recent comments for moderation (any status). */
export async function listRecentComments(db: Db, limit: number, postId?: string): Promise<Comment[]> {
  let q = db.selectFrom("comment").selectAll().orderBy("created_at", "desc").limit(limit);
  if (postId) q = q.where("post_id", "=", postId);
  return q.execute();
}

/** 1-based page (of `pageSize` top-level comments, oldest first) that shows the given top-level comment. */
export async function topLevelPageOf(db: Db, comment: Comment, pageSize: number): Promise<number> {
  const row = await db
    .selectFrom("comment")
    .select(sql<string>`count(*)`.as("n"))
    .where("post_id", "=", comment.post_id)
    .where("parent_id", "is", null)
    .where("status", "=", "visible")
    .where((eb) => eb.or([eb("created_at", "<", comment.created_at), eb.and([eb("created_at", "=", comment.created_at), eb("id", "<=", comment.id)])]))
    .executeTakeFirst();
  return Math.max(1, Math.ceil(Number(row?.n ?? 1) / pageSize));
}
