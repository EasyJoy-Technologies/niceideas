import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { countMediaSince, countPostsSince, countRevisionsSince } from "@/server/db/repos/counters";
import { ApiError } from "@/server/http/errors";

const HOUR = 3600;
const DAY = 86400;

/**
 * Per-user publishing limits (plan §11), counted from stored rows so they hold
 * across restarts and processes. A small overshoot under heavy concurrency is acceptable.
 */
function limited(window: number): ApiError {
  return new ApiError("rate.limited", 429, { retryAfterSeconds: window }, { "Retry-After": String(window) });
}

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
