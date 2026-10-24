// Background worker (plan docs/plan/2026-10-24-s2-worker.md): NiceNote media, notifications to the
// NiceMatrix backend, avatars. Bundled to dist/worker.mjs; runs as the `niceideas-*-worker` systemd
// service with the web service's environment. SIGTERM / SIGINT: finishes or hands back the current
// items, then exits.
import { getDb } from "../src/server/db";
import { getMediaStores } from "../src/server/storage";
import { runWorker } from "../src/server/worker/run-worker";

const db = getDb();
const stop = new AbortController();
for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => stop.abort());
try {
  await runWorker(db, getMediaStores(), stop.signal);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
