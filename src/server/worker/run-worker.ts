import sharp from "@/server/media/sharp";
import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { nextAvatarJobDueAt } from "@/server/db/repos/avatar-jobs";
import { nextMediaJobDueAt } from "@/server/db/repos/media-jobs";
import { nextVisibilityDueAt } from "@/server/db/repos/media-visibility";
import { nextOutboxDueAt } from "@/server/db/repos/outbox";
import { runVisibilityChecks } from "@/server/media/visibility";
import type { MediaStores } from "@/server/storage/types";
import { runNextAvatarJob } from "./avatar-job-runner";
import { idleDelayMs, pollLoop } from "./loop";
import { runNextMediaJob } from "./media-job-runner";
import { deliverOutbox } from "./outbox-delivery";
import { WorkWakeup } from "./wakeup";

/**
 * The background worker (plan docs/plan/2026-10-24-s2-worker.md §1): four independent loops —
 * notifications to the NiceMatrix backend, NiceNote media (one at a time), avatars, media
 * visibility checks (public / private store) — until `signal`
 * aborts. Work items live in the database (leased), so a restart loses nothing. Idle loops sleep
 * until NOTIFY niceideas_work names their table (migration 0015) or their next item falls due.
 */
export async function runWorker(db: Db, stores: MediaStores, signal: AbortSignal): Promise<void> {
  const c = getConfig();
  // One image at a time with two libvips threads (no operation cache, see media/sharp.ts).
  sharp.concurrency(2);
  const key = c.NICEMATRIX_SHARE_KEY;
  if (!key) console.warn(JSON.stringify({ event: "worker_idle", reason: "NICEMATRIX_SHARE_KEY not set: nothing is sent or fetched" }));
  const media = { db, stores, cacheControl: c.MEDIA_CACHE_CONTROL, key, maxBytes: c.MEDIA_SHARE_MAX_BYTES, maxImagePixels: c.MEDIA_MAX_IMAGE_PIXELS };
  const wakeup = new WorkWakeup(c.DATABASE_URL);
  wakeup.start(signal);
  // Without the share key outbox and media items wait: no point in waking for them.
  const none = async () => null;
  const idle = (table: string, nextDueAt: (db: Db) => Promise<Date | null>) => async () =>
    wakeup.wait(table, idleDelayMs(wakeup.listening, wakeup.listening ? await nextDueAt(db) : null), signal);
  console.log(JSON.stringify({ event: "worker_start" }));
  await Promise.all([
    pollLoop("outbox", async () => (await deliverOutbox(db, key)) > 0, { idle: idle("outbox", key ? nextOutboxDueAt : none), signal }),
    pollLoop("media", () => runNextMediaJob(media, signal), { idle: idle("media_job", key ? nextMediaJobDueAt : none), signal }),
    pollLoop("avatar", () => runNextAvatarJob({ db, publicStore: stores.publicStore }), { idle: idle("avatar_job", nextAvatarJobDueAt), signal }),
    pollLoop("visibility", () => runVisibilityChecks({ db, stores, cacheControl: c.MEDIA_CACHE_CONTROL }), { idle: idle("media", nextVisibilityDueAt), signal }),
  ]);
  await wakeup.close();
  console.log(JSON.stringify({ event: "worker_stop" }));
}
