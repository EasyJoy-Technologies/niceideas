import { claimAccountEvent, completeAccountEvent, latestAccountEventAt, releaseAccountEvent } from "@/server/db/repos/accounts";
import { findProfile } from "@/server/db/repos/profiles";
import { ApiError } from "@/server/http/errors";
import { followNiceMatrixProfile } from "@/server/profiles/profile-follow";
import { cancelCoolingOff, completeDeletion, startCoolingOff, type DeletionRuntime } from "./account-deletion";
import type { AccountEvent } from "./account-events";

export type AccountRuntime = DeletionRuntime;
export type AccountEventResult = "applied" | "duplicate" | "stale" | "unknown_user";

/** Lease of one delivery; a crashed attempt is taken over by a redelivery after this. */
const LEASE_SECONDS = 600;
const RETRY_AFTER_SECONDS = 60;

async function run(rt: AccountRuntime, e: AccountEvent): Promise<AccountEventResult> {
  if (e.event === "profile_updated") {
    const profile = await findProfile(rt.db, e.userId);
    if (!profile) return "unknown_user";
    await followNiceMatrixProfile(rt.db, profile, e.profile ?? {});
    return "applied";
  }
  const latest = await latestAccountEventAt(rt.db, e.userId);
  if (latest && new Date(e.occurredAt) < latest && e.event !== "deletion_completed") return "stale";
  if (e.event === "deletion_requested") await startCoolingOff(rt, e.userId);
  else if (e.event === "deletion_cancelled") await cancelCoolingOff(rt, e.userId);
  else await completeDeletion(rt, e.userId);
  return "applied";
}

/**
 * Applies an event once (contract docs/api/account-events.md). It counts as done only after every
 * step succeeded: a failed attempt answers 5xx and the backend's redelivery runs it again (the steps
 * are idempotent). A delivery arriving while another one runs answers 503 (retry later).
 * Stale deletion events (older than the latest completed one) are ignored; profile_updated carries
 * the latest values and is applied as is, outside the ordering of deletion events.
 */
export async function applyAccountEvent(rt: AccountRuntime, e: AccountEvent): Promise<AccountEventResult> {
  const claim = await claimAccountEvent(rt.db, { eventId: e.eventId, userId: e.userId, event: e.event, occurredAt: new Date(e.occurredAt) }, LEASE_SECONDS);
  if (claim === "completed") return "duplicate";
  if (claim === "busy") throw new ApiError("account_event.in_progress", 503, undefined, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  let result: AccountEventResult;
  try {
    result = await run(rt, e);
  } catch (err) {
    await releaseAccountEvent(rt.db, e.eventId).catch((r) => console.error("[account-events] release failed", e.eventId, r));
    throw err;
  }
  await completeAccountEvent(rt.db, e.eventId);
  return result;
}
