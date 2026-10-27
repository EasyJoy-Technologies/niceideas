import type { Db } from "@/server/db/client";
import { purgeOldAccountEvents } from "@/server/db/repos/accounts";
import { purgeExpiredIdempotency } from "@/server/db/repos/idempotency";
import { purgeSpentChallenges } from "@/server/db/repos/pow";
import { purgeDeliveredOutbox } from "@/server/db/repos/outbox";
import { purgeExpiredServiceNonces } from "@/server/db/repos/service-nonces";
import { purgeExpiredSessions } from "@/server/db/repos/sessions";
import { purgeExpiredWebTickets } from "@/server/db/repos/web-tickets";
import { deleteMediaRows, deletePosts, listDeletableMedia, listExpiredPosts, listStrayPublicMedia, mediaOfPosts, purgeExpiredBans } from "@/server/db/repos/maintenance";
import { mediaKeys } from "@/server/media/keys";
import { getConfig } from "@/server/config/env";
import { requestVisibilityCheck } from "@/server/db/repos/media-visibility";
import { dropUpload, listStaleUploads } from "@/server/db/repos/media-uploads";
import { checkMediaVisibility } from "@/server/media/visibility";
import type { MediaStores } from "@/server/storage/types";

/** Unreferenced media are kept this long before physical deletion (plan §10). */
export const MEDIA_GRACE_DAYS = 7;
const BATCH = 200;
/** Delivered backend notifications are kept this long for diagnostics. */
const OUTBOX_KEEP_DAYS = 30;
/** Processed account-event ids (ids and times only) are kept this long for duplicate detection. */
const ACCOUNT_EVENT_KEEP_DAYS = 90;
/** An upload without its media row after this long failed (the longest transcode is 1 hour). */
const UPLOAD_STALE_HOURS = 24;

export type MaintenanceReport = { postsPurged: number; mediaDeleted: number; strayPublicWithdrawn: number; uploadsCleaned: number; idempotencyPurged: number; bansExpired: number; sessionsExpired: number; ticketsExpired: number; challengesExpired: number; noncesExpired: number; outboxPurged: number; accountEventsPurged: number };

/**
 * Daily job (plan §10): physically deletes posts past their 30-day retention,
 * then media no post uses any more (objects first, rows after), re-checks media
 * public without a live post, removes objects of failed uploads, and drops expired idempotency keys, bans, web sessions, app sign-in tickets, spent PoW challenges, service-signature nonces
 * backend notifications delivered over 30 days ago and account-event ids processed over 90 days ago.
 * Safe to re-run; each step is idempotent.
 */
export async function runMaintenance(db: Db, stores: MediaStores): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { postsPurged: 0, mediaDeleted: 0, strayPublicWithdrawn: 0, uploadsCleaned: 0, idempotencyPurged: 0, bansExpired: 0, sessionsExpired: 0, ticketsExpired: 0, challengesExpired: 0, noncesExpired: 0, outboxPurged: 0, accountEventsPurged: 0 };

  const visibility = { db, stores, cacheControl: getConfig().MEDIA_CACHE_CONTROL };
  for (;;) {
    const posts = (await listExpiredPosts(db, BATCH)).map((p) => p.id);
    if (posts.length === 0) break;
    const media = await mediaOfPosts(db, posts);
    await requestVisibilityCheck(db, media);
    await checkMediaVisibility(visibility, media);
    await deletePosts(db, posts);
    report.postsPurged += posts.length;
    report.mediaDeleted += await deleteMedia(db, stores, media);
  }
  report.mediaDeleted += await deleteMedia(db, stores, []);

  const stray = await listStrayPublicMedia(db, 1000);
  await requestVisibilityCheck(db, stray);
  await checkMediaVisibility(visibility, stray);
  report.strayPublicWithdrawn = stray.length;
  report.uploadsCleaned = await cleanStaleUploads(db, stores);

  report.idempotencyPurged = await purgeExpiredIdempotency(db);
  report.bansExpired = await purgeExpiredBans(db);
  report.sessionsExpired = await purgeExpiredSessions(db);
  report.ticketsExpired = await purgeExpiredWebTickets(db);
  report.challengesExpired = await purgeSpentChallenges(db);
  report.noncesExpired = await purgeExpiredServiceNonces(db);
  report.outboxPurged = await purgeDeliveredOutbox(db, OUTBOX_KEEP_DAYS);
  report.accountEventsPurged = await purgeOldAccountEvents(db, ACCOUNT_EVENT_KEEP_DAYS);
  return report;
}

async function deleteMedia(db: Db, stores: MediaStores, candidates: string[]): Promise<number> {
  let total = 0;
  for (;;) {
    const media = await listDeletableMedia(db, MEDIA_GRACE_DAYS, candidates, BATCH);
    if (media.length === 0) return total;
    const keys = media.flatMap((m) => mediaKeys(m));
    await stores.publicStore.deleteMany(keys);
    await stores.privateStore.deleteMany(keys);
    await deleteMediaRows(db, media.map((m) => m.id));
    total += media.length;
    candidates = [];
  }
}

/** Objects of uploads that never got their media row (crash or error between storing and the row). */
async function cleanStaleUploads(db: Db, stores: MediaStores): Promise<number> {
  const prefixes = await listStaleUploads(db, UPLOAD_STALE_HOURS, 1000);
  for (const prefix of prefixes) {
    await stores.privateStore.deleteMany(await stores.privateStore.listKeys(`${prefix}/`));
    await dropUpload(db, prefix);
  }
  return prefixes.length;
}
