import { sql } from "kysely";
import type { Db } from "../client";
import type { FeedCursor, FeedRow } from "./feed";

/** Saves a post for the user and bumps its counter; returns the new count. Idempotent. */
export async function addBookmark(db: Db, userId: string, postId: string): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const inserted = await trx.insertInto("post_bookmark").values({ user_id: userId, post_id: postId }).onConflict((oc) => oc.doNothing()).executeTakeFirst();
    const delta = Number(inserted.numInsertedOrUpdatedRows ?? 0);
    const row = await trx.updateTable("post").set({ bookmark_count: sql`bookmark_count + ${delta}` }).where("id", "=", postId).returning("bookmark_count").executeTakeFirst();
    return row?.bookmark_count ?? 0;
  });
}

/** Removes the user's bookmark; returns the new count. Idempotent. */
export async function removeBookmark(db: Db, userId: string, postId: string): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const deleted = await trx.deleteFrom("post_bookmark").where("user_id", "=", userId).where("post_id", "=", postId).executeTakeFirst();
    const delta = Number(deleted.numDeletedRows ?? 0);
    const row = await trx.updateTable("post").set({ bookmark_count: sql`greatest(bookmark_count - ${delta}, 0)` }).where("id", "=", postId).returning("bookmark_count").executeTakeFirst();
    return row?.bookmark_count ?? 0;
  });
}

/** Which of the given posts the user saved (page rendering). */
export async function bookmarkedAmong(db: Db, userId: string | null, postIds: string[]): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();
  const rows = await db.selectFrom("post_bookmark").select("post_id").where("user_id", "=", userId).where("post_id", "in", postIds).execute();
  return new Set(rows.map((r) => r.post_id));
}

export type BookmarkRow = FeedRow & { bookmarked_at: Date };

/**
 * The user's saved posts, most recently saved first (keyset on save time + post id). Only posts the user
 * may see now: live, public or their own, by an active author; the others stay saved and reappear when
 * they are back.
 */
export async function listBookmarkedPosts(db: Db, userId: string, cursor: FeedCursor | null, limit: number): Promise<BookmarkRow[]> {
  return db
    .selectFrom("post_bookmark as b")
    .innerJoin("post", "post.id", "b.post_id")
    .innerJoin("profile", "profile.user_id", "post.author_id")
    .selectAll("post")
    .select(["profile.handle as author_handle", "profile.display_name as author_name", "profile.avatar_url as author_avatar", "b.created_at as bookmarked_at"])
    .where("b.user_id", "=", userId)
    .where("post.status", "=", "active")
    .where((eb) => eb.or([eb("post.visibility", "=", "public"), eb("post.author_id", "=", userId)]))
    .where("profile.status", "=", "active")
    .$if(!!cursor, (q) => q.where(sql<boolean>`(b.created_at, b.post_id) < (${cursor!.at}, ${cursor!.id}::uuid)`))
    .orderBy("b.created_at", "desc")
    .orderBy("b.post_id", "desc")
    .limit(limit)
    .execute();
}
