import type { Db } from "@/server/db/client";
import { purgeExpiredIdempotency } from "@/server/db/repos/idempotency";
import { deleteMediaRows, deletePosts, listDeletableMedia, listExpiredPosts, listStrayPublicMedia, mediaOfPosts, purgeExpiredBans } from "@/server/db/repos/maintenance";
import { mediaKeys } from "@/server/media/keys";
import { withdrawUnreferencedMedia } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";

/** Unreferenced media are kept this long before physical deletion (plan §10). */
export const MEDIA_GRACE_DAYS = 7;
const BATCH = 200;

export type MaintenanceReport = { postsPurged: number; mediaDeleted: number; strayPublicWithdrawn: number; idempotencyPurged: number; bansExpired: number };

/**
 * Daily job (plan §10): physically deletes posts past their 30-day retention,
 * then media no post uses any more (objects first, rows after), re-runs failed
 * public-bucket withdrawals, and drops expired idempotency keys and bans.
 * Safe to re-run; each step is idempotent.
 */
export async function runMaintenance(db: Db, stores: MediaStores): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { postsPurged: 0, mediaDeleted: 0, strayPublicWithdrawn: 0, idempotencyPurged: 0, bansExpired: 0 };

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
