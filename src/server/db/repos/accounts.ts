import { sql } from "kysely";
import type { Db } from "../client";
import type { AccountEventKind, ProfileStatus } from "../schema";

/** Records an event id; false when it was already processed (duplicate delivery). */
export async function claimAccountEvent(db: Db, e: { eventId: string; userId: string; event: AccountEventKind; occurredAt: Date }): Promise<boolean> {
  const r = await db
    .insertInto("account_event")
    .values({ event_id: e.eventId, user_id: e.userId, event: e.event, occurred_at: e.occurredAt })
    .onConflict((oc) => oc.column("event_id").doNothing())
    .executeTakeFirst();
  return Number(r.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** Latest event already applied for the user (out-of-order deliveries are ignored). */
export async function latestAccountEventAt(db: Db, userId: string): Promise<Date | null> {
  const row = await db.selectFrom("account_event").select(sql<Date>`max(occurred_at)`.as("at")).where("user_id", "=", userId).executeTakeFirst();
  return row?.at ?? null;
}

export async function setProfileStatus(db: Db, userId: string, status: ProfileStatus): Promise<void> {
  await db.updateTable("profile").set({ status, updated_at: new Date() }).where("user_id", "=", userId).execute();
}

/** Moves the user's posts between `active` and `author_deleting`; returns affected post ids. */
export async function switchAuthorPosts(db: Db, userId: string, from: "active" | "author_deleting", to: "active" | "author_deleting"): Promise<string[]> {
  const rows = await db
    .updateTable("post")
    .set({ status: to, status_changed_at: new Date() })
    .where("author_id", "=", userId)
    .where("status", "=", from)
    .returning("id")
    .execute();
  return rows.map((r) => r.id);
}

export async function postIdsOfAuthor(db: Db, userId: string): Promise<string[]> {
  return (await db.selectFrom("post").select("id").where("author_id", "=", userId).execute()).map((r) => r.id);
}

export async function mediaOfOwner(db: Db, userId: string) {
  return db.selectFrom("media").selectAll().where("owner_id", "=", userId).execute();
}

/** Deletes the profile with everything it owns (call after the user's posts were deleted). */
export async function deleteProfileCascade(db: Db, userId: string, mediaIds: string[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    if (mediaIds.length) {
      await trx.deleteFrom("revision_media").where("media_id", "in", mediaIds).execute();
      await trx.deleteFrom("media").where("id", "in", mediaIds).execute();
    }
    // Profile cascade: comments, likes and follows authored by the user.
    await trx.deleteFrom("profile").where("user_id", "=", userId).execute();
  });
}
