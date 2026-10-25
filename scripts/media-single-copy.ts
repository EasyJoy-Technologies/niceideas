// One-off (v1.0.66): keeps one stored copy per media file — public media only in the public bucket,
// all others only in the private bucket. Idempotent. Bundled to dist/media-single-copy.mjs; run once
// per environment with the service environment after deploying v1.0.66.
import { getConfig } from "../src/server/config/env";
import { getDb } from "../src/server/db";
import { convertToSingleCopy } from "../src/server/media/single-copy";
import { getMediaStores } from "../src/server/storage";

const db = getDb();
try {
  const report = await convertToSingleCopy(db, getMediaStores(), getConfig().MEDIA_CACHE_CONTROL);
  console.log(JSON.stringify({ event: "media_single_copy", ...report }));
  if (report.missing.length) process.exitCode = 2;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
