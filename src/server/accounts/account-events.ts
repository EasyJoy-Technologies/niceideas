import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { claimAccountEvent, deleteProfileCascade, latestAccountEventAt, mediaOfOwner, postIdsOfAuthor, setProfileStatus, switchAuthorPosts } from "@/server/db/repos/accounts";
import { findMediaByIds } from "@/server/db/repos/media";
import { deletePosts } from "@/server/db/repos/maintenance";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { ApiError, badRequest, unauthorized } from "@/server/http/errors";
import { mediaKeys } from "@/server/media/keys";
import { projectMediaPublic, recordMediaPublic, withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";

/**
 * NiceMatrix → NiceIdeas account events (plan §10; contract in docs/api/account-events.md).
 * Signature: hex HMAC-SHA256 of `${timestamp}.${rawBody}` with the shared secret;
 * timestamps older / newer than 5 minutes are rejected; `eventId` makes delivery idempotent.
 */
export const MAX_SKEW_SECONDS = 300;

const eventSchema = z.object({
  eventId: z.string().min(8).max(100),
  event: z.enum(["deletion_requested", "deletion_cancelled", "deletion_completed"]),
  userId: z.string().min(1).max(200),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type AccountEvent = z.infer<typeof eventSchema>;

export function signAccountEvent(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyAccountEvent(secret: string, headers: Headers, rawBody: string, now = Date.now()): AccountEvent {
  const ts = headers.get("x-nicematrix-timestamp") ?? "";
  const sig = headers.get("x-nicematrix-signature") ?? "";
  if (!/^\d{9,12}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > MAX_SKEW_SECONDS) throw unauthorized("signature.expired");
  const expected = Buffer.from(signAccountEvent(secret, ts, rawBody));
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), expected)) throw unauthorized("signature.invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw badRequest("request.invalid_json");
  }
  const r = eventSchema.safeParse(parsed);
  if (!r.success) throw badRequest("request.invalid");
  return r.data;
}

export type AccountRuntime = { db: Db; stores: MediaStores; cacheControl: string };

async function currentMediaIds(db: Db, postIds: string[]): Promise<string[]> {
  const rows = postIds.length ? await db.selectFrom("post").select("current_revision_id").where("id", "in", postIds).execute() : [];
  const ids = await Promise.all(rows.map((r) => (r.current_revision_id ? listRevisionMediaIds(db, r.current_revision_id) : [])));
  return [...new Set(ids.flat())];
}

/** Applies an event once; stale events (older than the latest applied one) are ignored. */
export async function applyAccountEvent(rt: AccountRuntime, e: AccountEvent): Promise<"applied" | "duplicate" | "stale"> {
  const occurredAt = new Date(e.occurredAt);
  const latest = await latestAccountEventAt(rt.db, e.userId);
  if (!(await claimAccountEvent(rt.db, { eventId: e.eventId, userId: e.userId, event: e.event, occurredAt }))) return "duplicate";
  if (latest && occurredAt < latest && e.event !== "deletion_completed") return "stale";

  if (e.event === "deletion_requested") {
    // Cooling-off starts: everything goes offline at once (pages answer 410).
    await setProfileStatus(rt.db, e.userId, "deleting");
    const posts = await switchAuthorPosts(rt.db, e.userId, "active", "author_deleting");
    await withdrawUnreferencedMedia(rt.db, rt.stores, await currentMediaIds(rt.db, posts));
  } else if (e.event === "deletion_cancelled") {
    const posts = await rt.db.selectFrom("post").select("id").where("author_id", "=", e.userId).where("status", "=", "author_deleting").execute();
    const media = await findMediaByIds(rt.db, await currentMediaIds(rt.db, posts.map((p) => p.id)));
    await projectMediaPublic(rt.stores, media, rt.cacheControl);
    await rt.db.transaction().execute(async (trx) => {
      await setProfileStatus(trx, e.userId, "active");
      await switchAuthorPosts(trx, e.userId, "author_deleting", "active");
      await recordMediaPublic(trx, media.map((m) => m.id));
    });
  } else {
    // Cooling-off ended: delete everything now (no extra 30-day retention).
    const media = await mediaOfOwner(rt.db, e.userId);
    const keys = media.flatMap((m) => mediaKeys(m));
    await rt.stores.publicStore.deleteMany(keys);
    await rt.stores.privateStore.deleteMany(keys);
    await deletePosts(rt.db, await postIdsOfAuthor(rt.db, e.userId));
    await deleteProfileCascade(rt.db, e.userId, media.map((m) => m.id));
  }
  return "applied";
}

export function accountEventsDisabled(): ApiError {
  return new ApiError("endpoint.disabled", 503);
}
