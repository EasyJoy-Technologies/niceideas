import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { claimCdnPurges, deleteCdnPurges, retryCdnPurges } from "@/server/db/repos/cdn-purge";
import { errorText, retryDelaySeconds, withinRetryWindow } from "@/server/worker/retry";
import { MAX_URLS_PER_PURGE, purgeUrls } from "./cloudflare";

const LEASE_SECONDS = 120;

/**
 * Worker: purges the next due URLs from the Cloudflare edge (F22). Failures are retried on the
 * outbox schedule for 24 hours, then dropped with a log line (the edge TTL bounds the damage).
 * Returns false when nothing was due (or no token is set).
 */
export async function runNextCdnPurge(db: Db): Promise<boolean> {
  const c = getConfig();
  if (!c.CLOUDFLARE_PURGE_TOKEN) return false;
  const items = await claimCdnPurges(db, MAX_URLS_PER_PURGE, LEASE_SECONDS);
  if (items.length === 0) return false;
  try {
    await purgeUrls({ token: c.CLOUDFLARE_PURGE_TOKEN, apiUrl: c.CLOUDFLARE_API_URL }, items.map((i) => i.url));
    await deleteCdnPurges(db, items);
    console.log(JSON.stringify({ event: "cdn_purge", result: "done", urls: items.length }));
  } catch (err) {
    const error = errorText(err);
    const live = items.filter((i) => withinRetryWindow(i.created_at));
    const expired = items.filter((i) => !withinRetryWindow(i.created_at));
    await retryCdnPurges(db, live, retryDelaySeconds(Math.max(...items.map((i) => i.attempts))), error);
    await deleteCdnPurges(db, expired);
    console.error(JSON.stringify({ event: "cdn_purge", result: expired.length ? "gave_up" : "retry", urls: items.length, error }));
  }
  return true;
}
