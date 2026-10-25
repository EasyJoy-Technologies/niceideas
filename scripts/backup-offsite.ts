// Off-site copy of a database dump (plan docs/plan/2026-10-25-remaining-work-and-cost.md, W3): uploads
// the given dump to the private R2 bucket under backups/ and prunes copies older than 30 days.
// Bundled to dist/backup-offsite.mjs; run by niceideas-backup.service after pg_dump.
//   node dist/backup-offsite.mjs /var/backups/niceideas/niceideas-<UTC>.sql.gz
import { getConfig } from "../src/server/config/env";
import { uploadBackup } from "../src/server/ops/offsite-backup";
import { createS3Client } from "../src/server/storage/s3-store";

const KEEP_DAYS = 30;
const file = process.argv[2];
const c = getConfig();
try {
  if (!file) throw new Error("usage: backup-offsite <dump file>");
  if (c.STORAGE_DRIVER !== "s3") throw new Error("STORAGE_DRIVER is not s3: no off-site bucket");
  const client = createS3Client(c.S3_ENDPOINT!, c.S3_REGION, c.S3_ACCESS_KEY_ID!, c.S3_SECRET_ACCESS_KEY!);
  const r = await uploadBackup(client, c.S3_PRIVATE_BUCKET!, file, KEEP_DAYS);
  console.log(JSON.stringify({ event: "backup_offsite", ...r }));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
