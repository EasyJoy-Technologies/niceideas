import { sql } from "kysely";
import type { Db } from "../client";
import type { PostRevision } from "../schema";

export async function findRevision(db: Db, id: string): Promise<PostRevision | undefined> {
  return db.selectFrom("post_revision").selectAll().where("id", "=", id).executeTakeFirst();
}

/** Appends the next revision of a post (caller holds the post row lock). */
export async function insertRevision(
  db: Db,
  input: { postId: string; document: unknown; contentHash: string; sourceUpdatedAt: Date | null },
): Promise<PostRevision> {
  return db
    .insertInto("post_revision")
    .values({
      post_id: input.postId,
      revision_no: sql<number>`(SELECT coalesce(max(revision_no), 0) + 1 FROM post_revision WHERE post_id = ${input.postId})`,
      document: JSON.stringify(input.document),
      content_hash: input.contentHash,
      source_updated_at: input.sourceUpdatedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function linkRevisionMedia(db: Db, revisionId: string, mediaIds: string[]): Promise<void> {
  const unique = [...new Set(mediaIds)];
  if (unique.length === 0) return;
  await db
    .insertInto("revision_media")
    .values(unique.map((media_id) => ({ revision_id: revisionId, media_id })))
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function listRevisionMediaIds(db: Db, revisionId: string): Promise<string[]> {
  const rows = await db.selectFrom("revision_media").select("media_id").where("revision_id", "=", revisionId).execute();
  return rows.map((r) => r.media_id);
}
