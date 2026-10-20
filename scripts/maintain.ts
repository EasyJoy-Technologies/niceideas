// Daily maintenance (plan §10): purge expired posts and unused media, retry failed
// public withdrawals, drop expired idempotency keys / bans. Bundled to dist/maintain.mjs;
// run by the `niceideas-*-maintain` systemd timer with the service environment.
import { getDb } from "../src/server/db";
import { runMaintenance } from "../src/server/maintenance/run-maintenance";
import { getMediaStores } from "../src/server/storage";

const db = getDb();
try {
  const report = await runMaintenance(db, getMediaStores());
  console.log(JSON.stringify({ event: "maintenance", ...report }));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
