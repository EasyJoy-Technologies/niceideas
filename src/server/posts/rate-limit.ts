import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { findApiClientById } from "@/server/db/repos/api-clients";
import { countAppUserPostsSince, countClientPostsSince, countMediaSince, countPostsSince, countRevisionsSince } from "@/server/db/repos/counters";
import { rateLimited } from "@/server/http/errors";

const HOUR = 3600;
const DAY = 86400;

/**
 * Per-user publishing limits (plan §11), counted from stored rows so they hold
 * across restarts and processes. A small overshoot under heavy concurrency is acceptable.
 */
const limited = rateLimited;

export async function assertCanCreatePost(db: Db, userId: string): Promise<void> {
  const cfg = getConfig();
  if ((await countPostsSince(db, userId, HOUR)) >= cfg.RATE_POSTS_PER_HOUR) throw limited(HOUR);
  if ((await countPostsSince(db, userId, DAY)) >= cfg.RATE_POSTS_PER_DAY) throw limited(DAY);
}

export async function assertCanCreateRevision(db: Db, userId: string): Promise<void> {
  if ((await countRevisionsSince(db, userId, HOUR)) >= getConfig().RATE_REVISIONS_PER_HOUR) throw limited(HOUR);
}

export async function assertCanUploadMedia(db: Db, userId: string): Promise<void> {
  if ((await countMediaSince(db, userId, HOUR)) >= getConfig().RATE_MEDIA_PER_HOUR) throw limited(HOUR);
}

/** External apps (on top of the per-user limits): per app × user, and per app overall (local override or default). */
export async function assertClientBudget(db: Db, apiClientId: string, userId: string): Promise<void> {
  const cfg = getConfig();
  if ((await countAppUserPostsSince(db, apiClientId, userId, HOUR)) >= cfg.RATE_APP_USER_POSTS_PER_HOUR) throw limited(HOUR);
  const perApp = (await findApiClientById(db, apiClientId))?.posts_per_hour ?? cfg.RATE_CLIENT_POSTS_PER_HOUR;
  if ((await countClientPostsSince(db, apiClientId, HOUR)) >= perApp) throw limited(HOUR);
}
