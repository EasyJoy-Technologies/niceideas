import sharp from "sharp";
import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { MediaStores } from "@/server/storage/types";
import { runNextAvatarJob } from "./avatar-job-runner";
import { pollLoop } from "./loop";
import { runNextMediaJob } from "./media-job-runner";
import { deliverOutbox } from "./outbox-delivery";

/** How often an idle loop looks for new work. */
const IDLE_MS = 2_000;

/**
 * The background worker (plan docs/plan/2026-10-24-s2-worker.md §1): three independent loops —
 * notifications to the NiceMatrix backend, NiceNote media (one at a time), avatars — until `signal`
 * aborts. Work items live in the database (leased), so a restart loses nothing.
 */
export async function runWorker(db: Db, stores: MediaStores, signal: AbortSignal): Promise<void> {
  const c = getConfig();
  // One image at a time, few libvips threads: the worker must not starve the web server of CPU.
  sharp.concurrency(2);
  sharp.cache(false);
  const key = c.NICEMATRIX_SHARE_KEY;
  if (!key) console.warn(JSON.stringify({ event: "worker_idle", reason: "NICEMATRIX_SHARE_KEY not set: nothing is sent or fetched" }));
  const media = { db, stores, cacheControl: c.MEDIA_CACHE_CONTROL, key, maxBytes: c.MEDIA_SHARE_MAX_BYTES, maxImagePixels: c.MEDIA_MAX_IMAGE_PIXELS };
  console.log(JSON.stringify({ event: "worker_start" }));
  await Promise.all([
    pollLoop("outbox", async () => (await deliverOutbox(db, key)) > 0, { idleMs: IDLE_MS, signal }),
    pollLoop("media", () => runNextMediaJob(media, signal), { idleMs: IDLE_MS, signal }),
    pollLoop("avatar", () => runNextAvatarJob({ db, publicStore: stores.publicStore }), { idleMs: IDLE_MS, signal }),
  ]);
  console.log(JSON.stringify({ event: "worker_stop" }));
}
