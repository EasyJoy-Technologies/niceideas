// Read-only (v1.0.71): lists the public bucket and compares it with the media table — public objects
// of media not recorded as public, objects of no media, recorded-public media with missing objects.
// Bundled to dist/media-audit.mjs; run with the service environment. Exit code 2 when anything is off.
import { getDb } from "../src/server/db";
import { auditPublicMedia } from "../src/server/media/public-audit";
import { getMediaStores } from "../src/server/storage";

const db = getDb();
try {
  const a = await auditPublicMedia(db, getMediaStores());
  const counts = { stray: a.strayMedia.length, unknown: a.unknownKeys.length, missing: a.missingMedia.length };
  console.log(JSON.stringify({ event: "media_public_audit", ...counts, ...a }));
  if (a.strayMedia.length || a.unknownKeys.length || a.missingMedia.length) process.exitCode = 2;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
