import type { Db } from "@/server/db/client";
import { purgeOldAccountEvents } from "@/server/db/repos/accounts";
import { purgeExpiredIdempotency } from "@/server/db/repos/idempotency";
import { purgeSpentChallenges } from "@/server/db/repos/pow";
import { purgeDeliveredOutbox } from "@/server/db/repos/outbox";
import { purgeExpiredServiceNonces } from "@/server/db/repos/service-nonces";
import { purgeExpiredSessions } from "@/server/db/repos/sessions";
import { deleteMediaRows, deletePosts, listDeletableMedia, listExpiredPosts, listStrayPublicMedia, mediaOfPosts, purgeExpiredBans } from "@/server/db/repos/maintenance";
import { mediaKeys } from "@/server/media/keys";
import { withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";

/** Unreferenced media are kept this long before physical deletion (plan §10). */
export const MEDIA_GRACE_DAYS = 7;
const BATCH = 200;
/** Delivered backend notifications are kept this long for diagnostics. */
const OUTBOX_KEEP_DAYS = 30;
/** Processed account-event ids (ids and times only) are kept this long for duplicate detection. */
const ACCOUNT_EVENT_KEEP_DAYS = 90;

export type MaintenanceReport = { postsPurged: number; mediaDeleted: number; strayPublicWithdrawn: number; idempotencyPurged: number; bansExpired: number; sessionsExpired: number; challengesExpired: number; noncesExpired: number; outboxPurged: number; accountEventsPurged: number };

/**
 * Daily job (plan §10): physically deletes posts past their 30-day retention,
 * then media no post uses any more (objects first, rows after), re-runs failed
 * public-bucket withdrawals, and drops expired idempotency keys, bans, web sessions, spent PoW challenges, service-signature nonces
 * backend notifications delivered over 30 days ago and account-event ids processed over 90 days ago.
 * Safe to re-run; each step is idempotent.
 */
export async function runMaintenance(db: Db, stores: MediaStores): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { postsPurged: 0, mediaDeleted: 0, strayPublicWithdrawn: 0, idempotencyPurged: 0, bansExpired: 0, sessionsExpired: 0, challengesExpired: 0, noncesExpired: 0, outboxPurged: 0, accountEventsPurged: 0 };

  for (;;) {
    const posts = (await listExpiredPosts(db, BATCH)).map((p) => p.id);
    if (posts.length === 0) break;
    const media = await mediaOfPosts(db, posts);
    await withdrawUnreferencedMedia(db, stores, media);
    await deletePosts(db, posts);
    report.postsPurged += posts.length;
    report.mediaDeleted += await deleteMedia(db, stores, media);
  }
  report.mediaDeleted += await deleteMedia(db, stores, []);

  const stray = await listStrayPublicMedia(db, 1000);
  await withdrawUnreferencedMedia(db, stores, stray);
  report.strayPublicWithdrawn = stray.length;

  report.idempotencyPurged = await purgeExpiredIdempotency(db);
  report.bansExpired = await purgeExpiredBans(db);
  report.sessionsExpired = await purgeExpiredSessions(db);
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
