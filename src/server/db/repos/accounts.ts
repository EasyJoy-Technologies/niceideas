import { sql } from "kysely";
import type { Db } from "../client";
import type { AccountEventKind, PostStatus, Profile, ProfileStatus } from "../schema";

/** `until` is the claim's lease end, its token for `releaseAccountEvent`. */
export type AccountEventClaim = { state: "claimed"; until: Date } | { state: "completed" } | { state: "busy" };

/**
 * Takes an event for processing: a new event, or one whose earlier attempt failed (not completed)
 * and whose lease ran out. `completed` = already handled (duplicate delivery); `busy` = another
 * delivery of the same event is running now.
 */
export async function claimAccountEvent(db: Db, e: { eventId: string; userId: string; event: AccountEventKind; occurredAt: Date }, leaseSeconds: number): Promise<AccountEventClaim> {
  // Millisecond precision: the lease end is compared again from JavaScript (token).
  const until = sql<Date>`date_trunc('milliseconds', now() + make_interval(secs => ${leaseSeconds}))`;
  const claimed = await db
    .insertInto("account_event")
    .values({ event_id: e.eventId, user_id: e.userId, event: e.event, occurred_at: e.occurredAt, claimed_until: until })
    .onConflict((oc) =>
      oc
        .column("event_id")
        .doUpdateSet({ claimed_until: until })
        .where("account_event.completed_at", "is", null)
        .where((eb) => eb.or([eb("account_event.claimed_until", "is", null), eb("account_event.claimed_until", "<", sql<Date>`now()`)])),
    )
    .returning("claimed_until")
    .executeTakeFirst();
  if (claimed?.claimed_until) return { state: "claimed", until: claimed.claimed_until };
  const row = await db.selectFrom("account_event").select("completed_at").where("event_id", "=", e.eventId).executeTakeFirst();
  return row?.completed_at ? { state: "completed" } : { state: "busy" };
}

/** All steps of the event succeeded: later deliveries are duplicates. */
export async function completeAccountEvent(db: Db, eventId: string): Promise<void> {
  await db.updateTable("account_event").set({ completed_at: sql<Date>`now()`, claimed_until: null }).where("event_id", "=", eventId).execute();
}

/** An attempt failed: the next delivery runs the event again at once (a lease taken over by another delivery meanwhile is left alone). */
export async function releaseAccountEvent(db: Db, eventId: string, until: Date): Promise<void> {
  await db.updateTable("account_event").set({ claimed_until: null }).where("event_id", "=", eventId).where("completed_at", "is", null).where("claimed_until", "=", until).execute();
}

/** Latest deletion event completed for the user (out-of-order deliveries are ignored). */
export async function latestAccountEventAt(db: Db, userId: string): Promise<Date | null> {
  // Profile updates do not take part in ordering (they would make later deletion events look stale).
  const row = await db
    .selectFrom("account_event")
    .select(sql<Date>`max(occurred_at)`.as("at"))
    .where("user_id", "=", userId)
    .where("event", "<>", "profile_updated")
    .where("completed_at", "is not", null)
    .executeTakeFirst();
  return row?.at ?? null;
}

/**
 * Drops completed event ids older than `olderThanDays` (they hold only ids and times). Backend
 * redeliveries end long before, so duplicate detection and ordering do not need them. Events not
 * completed are kept (a redelivery still runs them).
 */
export async function purgeOldAccountEvents(db: Db, olderThanDays: number): Promise<number> {
  const r = await db
    .deleteFrom("account_event")
    .where("completed_at", "<", sql<Date>`now() - make_interval(days => ${olderThanDays})`)
    .executeTakeFirst();
  return Number(r.numDeletedRows ?? 0);
}

/** Locks the profile against concurrent publishing (author-gate.ts) while its deletion state changes. */
export async function lockProfileForStatusChange(db: Db, userId: string): Promise<boolean> {
  return !!(await db.selectFrom("profile").select("user_id").where("user_id", "=", userId).forNoKeyUpdate().executeTakeFirst());
}

/** Shared lock on the profile while publishing for it; undefined when it is gone. */
export async function lockProfileShared(db: Db, userId: string): Promise<Pick<Profile, "status"> | undefined> {
  return db.selectFrom("profile").select("status").where("user_id", "=", userId).forShare().executeTakeFirst();
}

/** Remembers for good that the user's deletion completed (idempotent). */
export async function insertDeletedAccount(db: Db, userId: string): Promise<void> {
  await db.insertInto("deleted_account").values({ user_id: userId }).onConflict((oc) => oc.column("user_id").doNothing()).execute();
}

export async function isDeletedAccount(db: Db, userId: string): Promise<boolean> {
  return !!(await db.selectFrom("deleted_account").select("user_id").where("user_id", "=", userId).executeTakeFirst());
}

export async function setProfileStatus(db: Db, userId: string, status: ProfileStatus): Promise<void> {
  await db.updateTable("profile").set({ status, updated_at: new Date() }).where("user_id", "=", userId).execute();
}

/** Moves the user's posts between `active` and `author_deleting`; returns affected post ids. */
export async function switchAuthorPosts(db: Db, userId: string, from: "active" | "author_deleting", to: "active" | "author_deleting"): Promise<string[]> {
  const rows = await db
    .updateTable("post")
    .set({ status: to, status_changed_at: new Date(), updated_at: new Date() })
    .where("author_id", "=", userId)
    .where("status", "=", from)
    .returning("id")
    .execute();
  return rows.map((r) => r.id);
}

export async function postIdsOfAuthor(db: Db, userId: string, status?: PostStatus): Promise<string[]> {
  const q = db.selectFrom("post").select("id").where("author_id", "=", userId);
  return (await (status ? q.where("status", "=", status) : q).execute()).map((r) => r.id);
}

export async function mediaOfOwner(db: Db, userId: string) {
  return db.selectFrom("media").selectAll().where("owner_id", "=", userId).execute();
}

/**
 * Deletes the profile with everything it owns (call after the user's posts were deleted). Returns the
 * avatar URL it had at that moment (an avatar stored meanwhile is cleaned up by the caller).
 */
export async function deleteProfileCascade(db: Db, userId: string, mediaIds: string[]): Promise<string | null> {
  return db.transaction().execute(async (trx) => {
    if (mediaIds.length) {
      await trx.deleteFrom("revision_media").where("media_id", "in", mediaIds).execute();
      await trx.deleteFrom("media").where("id", "in", mediaIds).execute();
    }
    // Profile cascade: comments, likes and follows authored by the user.
    const row = await trx.deleteFrom("profile").where("user_id", "=", userId).returning("avatar_url").executeTakeFirst();
    return row?.avatar_url ?? null;
  });
}
