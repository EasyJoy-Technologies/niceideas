import { sql } from "kysely";
import type { Db } from "../client";
import type { Media } from "../schema";

/** Posts whose retention period ended (withdrawn / removed more than N days ago). */
export async function listExpiredPosts(db: Db, limit: number): Promise<{ id: string }[]> {
  return db.selectFrom("post").select("id").where("purge_after", "<", sql<Date>`now()`).orderBy("purge_after").limit(limit).execute();
}

/** Media used by any revision of the given posts (collected before the posts are deleted). */
export async function mediaOfPosts(db: Db, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const rows = await db
    .selectFrom("revision_media as rm")
    .innerJoin("post_revision as r", "r.id", "rm.revision_id")
    .select("rm.media_id")
    .distinct()
    .where("r.post_id", "in", postIds)
    .execute();
  return rows.map((r) => r.media_id);
}

/** Physically deletes posts; revisions, comments, likes and reports cascade. */
export async function deletePosts(db: Db, postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("post").set({ current_revision_id: null, cover_media_id: null }).where("id", "in", postIds).execute();
    await trx.deleteFrom("post").where("id", "in", postIds).execute();
  });
}

/**
 * Media eligible for physical deletion: not used by the current revision of any
 * post and either detached for over `graceDays`, or never published and older
 * than `graceDays`, or listed in `orphanCandidates` (posts just purged).
 */
export async function listDeletableMedia(db: Db, graceDays: number, orphanCandidates: string[], limit: number): Promise<Media[]> {
  return db
    .selectFrom("media as m")
    .selectAll("m")
    .where((eb) =>
      eb.or([
        eb("m.detached_at", "<", sql<Date>`now() - make_interval(days => ${graceDays})`),
        eb.and([eb("m.public_at", "is", null), eb("m.created_at", "<", sql<Date>`now() - make_interval(days => ${graceDays})`)]),
        ...(orphanCandidates.length ? [eb("m.id", "in", orphanCandidates)] : []),
      ]),
    )
    .where(({ not, exists, selectFrom }) =>
      not(exists(selectFrom("revision_media as rm").innerJoin("post as p", "p.current_revision_id", "rm.revision_id").select(sql`1`.as("x")).whereRef("rm.media_id", "=", "m.id"))),
    )
    .where(({ not, exists, selectFrom }) => not(exists(selectFrom("post as p").select(sql`1`.as("x")).whereRef("p.cover_media_id", "=", "m.id"))))
    .limit(limit)
    .execute();
}

/** Drops links from old (non-current) revisions, then the media rows. */
export async function deleteMediaRows(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("revision_media").where("media_id", "in", ids).execute();
    await trx.deleteFrom("media").where("id", "in", ids).execute();
  });
}

/** Media marked public although no active post of an active author uses them (a check that failed). */
export async function listStrayPublicMedia(db: Db, limit: number): Promise<string[]> {
  const rows = await db
    .selectFrom("media as m")
    .select("m.id")
    .where("m.public_at", "is not", null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("revision_media as rm")
            .innerJoin("post as p", "p.current_revision_id", "rm.revision_id")
            .innerJoin("profile as a", "a.user_id", "p.author_id")
            .select(sql`1`.as("x"))
            .whereRef("rm.media_id", "=", "m.id")
            .where("p.status", "=", "active")
            .where("a.status", "=", "active"),
        ),
      ),
    )
    .limit(limit)
    .execute();
  return rows.map((r) => r.id);
}

export async function purgeExpiredBans(db: Db): Promise<number> {
  const r = await db.deleteFrom("visitor_ban").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  return Number(r.numDeletedRows);
}
