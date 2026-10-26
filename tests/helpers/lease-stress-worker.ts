/**
 * One worker process of the F13 stress test (tests/integration/worker/lease-stress.test.ts): runs the
 * media, outbox and avatar runners against the shared test database and stores until SIGTERM.
 * Env: DATABASE_URL, NICEMATRIX_SHARE_KEY, NICEMATRIX_API_URL, STRESS_ROOT (stores), STRESS_AVATAR (PNG path).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getConfig } from "@/server/config/env";
import { createDb } from "@/server/db/client";
import { LocalStore } from "@/server/storage/local-store";
import { runNextAvatarJob } from "@/server/worker/avatar-job-runner";
import { runNextMediaJob } from "@/server/worker/media-job-runner";
import { deliverOutbox } from "@/server/worker/outbox-delivery";

const c = getConfig();
const db = createDb(c.DATABASE_URL, 4);
const root = process.env.STRESS_ROOT!;
const stores = { privateStore: new LocalStore(path.join(root, "private")), publicStore: new LocalStore(path.join(root, "public")) };
const png = readFileSync(process.env.STRESS_AVATAR!);
const stop = new AbortController();
process.on("SIGTERM", () => stop.abort());

const media = { db, stores, cacheControl: "no-store", key: c.NICEMATRIX_SHARE_KEY, maxBytes: 10_000_000, maxImagePixels: 100_000_000 };
// Slow downloads keep avatar jobs in flight long enough for the test to expire their leases.
const download = async () => {
  await delay(20 + Math.random() * 120);
  return { contentType: "image/png", body: png };
};

async function loop(name: string, tick: () => Promise<boolean>): Promise<void> {
  while (!stop.signal.aborted) {
    try {
      if (!(await tick())) await delay(30);
    } catch (err) {
      console.error(JSON.stringify({ event: "worker_error", loop: name, error: String(err) }));
      await delay(30);
    }
  }
}

// The package is CommonJS for tsx: no top-level await.
void Promise.all([
  loop("media", () => runNextMediaJob(media, stop.signal)),
  loop("outbox", async () => (await deliverOutbox(db, c.NICEMATRIX_SHARE_KEY)) > 0),
  loop("avatar", () => runNextAvatarJob({ db, publicStore: stores.publicStore, download })),
]).then(() => db.destroy());
