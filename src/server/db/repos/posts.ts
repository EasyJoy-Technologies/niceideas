import type { Db } from "../client";
import type { NewPost, Post, PostSource, PostUpdate } from "../schema";

/** Statuses for which a post still occupies its (author, source, source_ref) slot. */
export const LIVE_STATUSES = ["active", "author_deleting"] as const;

export async function findPostById(db: Db, id: string): Promise<Post | undefined> {
  return db.selectFrom("post").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function findPostBySlug(db: Db, slug: string): Promise<Post | undefined> {
  return db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirst();
}

/** Locks the row for the rest of the transaction (serializes sync / status changes). */
/** Cache version of a post page: changes whenever the post changes (status, content, settings). */
export async function postPageVersion(db: Db, slug: string): Promise<string> {
  const row = await db.selectFrom("post").select(["status", "updated_at"]).where("slug", "=", slug).executeTakeFirst();
  return row ? `${row.status}:${row.updated_at.getTime()}` : "none";
}

export async function findPostByShareId(db: Db, shareId: string): Promise<Post | undefined> {
  return db.selectFrom("post").selectAll().where("share_id", "=", shareId).executeTakeFirst();
}

export async function lockPost(db: Db, id: string): Promise<Post | undefined> {
  return db.selectFrom("post").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
}

export async function findLivePostBySource(
  db: Db,
  authorId: string,
  source: PostSource,
  sourceRef: string,
): Promise<Post | undefined> {
  return db
    .selectFrom("post")
    .selectAll()
    .where("author_id", "=", authorId)
    .where("source", "=", source)
    .where("source_ref", "=", sourceRef)
    .where("status", "in", LIVE_STATUSES)
    .executeTakeFirst();
}

export async function insertPost(db: Db, row: NewPost): Promise<Post> {
  return db.insertInto("post").values(row).returningAll().executeTakeFirstOrThrow();
}

export async function updatePost(db: Db, id: string, patch: PostUpdate): Promise<Post> {
  return db
    .updateTable("post")
    .set({ ...patch, updated_at: new Date() })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
}
