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

export type SourceListItem = Pick<
  Post,
  "id" | "slug" | "source" | "source_ref" | "sync_mode" | "kind" | "source_updated_at" | "updated_at"
> & { content_hash: string | null };

/** Live publications of one author from the given sources (multi-device sync lookup). */
export async function listLiveBySources(db: Db, authorId: string, sources: PostSource[]): Promise<SourceListItem[]> {
  if (sources.length === 0) return [];
  return db
    .selectFrom("post")
    .leftJoin("post_revision", "post_revision.id", "post.current_revision_id")
    .select([
      "post.id",
      "post.slug",
      "post.source",
      "post.source_ref",
      "post.sync_mode",
      "post.kind",
      "post.source_updated_at",
      "post.updated_at",
      "post_revision.content_hash",
    ])
    .where("post.author_id", "=", authorId)
    .where("post.source", "in", sources)
    .where("post.status", "in", LIVE_STATUSES)
    .where("post.source_ref", "is not", null)
    .orderBy("post.updated_at", "desc")
    .execute();
}
