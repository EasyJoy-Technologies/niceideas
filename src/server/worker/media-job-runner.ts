import type { Db } from "@/server/db/client";
import { claimMediaJob, extendMediaJobLease, releaseMediaJob, retryMediaJobLater, settleMediaJob, type MediaJob } from "@/server/db/repos/media-jobs";
import { ingestShareMedia, MediaUnusableError } from "@/server/media/ingest-share";
import { applyRefToShares } from "@/server/nicenote/apply-share-media";
import { fetchGrant, GrantFetchError } from "@/server/nicenote/grant-fetch";
import type { MediaStores } from "@/server/storage/types";
import { removeTempDir, type SpooledBody } from "@/server/util/temp-file";
import { errorText } from "./retry";

export type MediaWorkerRuntime = {
  db: Db;
  stores: MediaStores;
  cacheControl: string;
  key: string | undefined;
  maxBytes: number;
  maxImagePixels: number;
};

const LEASE_SECONDS = 600;
/** The lease is renewed this often while a job runs (long downloads / transcodes). */
const LEASE_RENEW_MS = 60_000;
/** Attempts per grant before a temporary problem is reported (contract: the backend then pushes a new address). */
const MAX_ATTEMPTS = 3;
const LOCAL_RETRY_SECONDS = [60, 300];

type Outcome = { state: "done"; mediaId: string } | { state: "failed" | "rejected"; reason: string } | { retry: string } | { released: true };

/** What to do after an error (attempts already counted for this run). */
function onError(err: unknown, job: MediaJob, signal: AbortSignal): Outcome {
  if (signal.aborted) return { released: true };
  if (err instanceof MediaUnusableError) return { state: "rejected", reason: err.reason };
  if (err instanceof GrantFetchError && err.reason === "too_large") return { state: "rejected", reason: "too_large" };
  // An expired address cannot be retried; the backend pushes a fresh one about 5 minutes after the event.
  if (err instanceof GrantFetchError && err.reason === "fetch_expired") return { state: "failed", reason: "fetch_expired" };
  const reason = err instanceof GrantFetchError ? err.reason : "temporarily_unavailable";
  return job.attempts < MAX_ATTEMPTS ? { retry: `${reason}: ${errorText(err)}` } : { state: "failed", reason };
}

async function runJob(rt: MediaWorkerRuntime & { key: string }, job: MediaJob, signal: AbortSignal): Promise<Outcome> {
  if (job.attempts > MAX_ATTEMPTS) return { state: "failed", reason: job.error?.split(":")[0] || "temporarily_unavailable" };
  if (job.url_expires_at && job.url_expires_at.getTime() < Date.now()) return { state: "failed", reason: "fetch_expired" };
  let file: SpooledBody | undefined;
  try {
    file = await fetchGrant(job.url!, { key: rt.key, maxBytes: rt.maxBytes, signal });
    const media = await ingestShareMedia(rt.db, rt.stores.privateStore, { ownerId: job.owner_id, kind: job.kind, file, maxImagePixels: rt.maxImagePixels, signal });
    return { state: "done", mediaId: media.id };
  } catch (err) {
    return onError(err, job, signal);
  } finally {
    if (file) await removeTempDir(file.dir);
  }
}

/**
 * Takes the next due NiceNote media and fetches / stores it (plan docs/plan/2026-10-24-s2-worker.md
 * §3), then updates the shares using it. Temporary problems are retried here a few times before being
 * reported; files that can never work are remembered (`rejected`). Returns false when nothing was due.
 */
export async function runNextMediaJob(rt: MediaWorkerRuntime, signal: AbortSignal): Promise<boolean> {
  const key = rt.key;
  if (!key) return false;
  const job = await claimMediaJob(rt.db, LEASE_SECONDS);
  if (!job) return false;
  const started = Date.now();
  const renew = setInterval(() => void extendMediaJobLease(rt.db, job, LEASE_SECONDS).catch(() => undefined), LEASE_RENEW_MS);
  let outcome: Outcome;
  try {
    outcome = await runJob({ ...rt, key }, job, signal);
  } finally {
    clearInterval(renew);
  }
  if ("released" in outcome) {
    await releaseMediaJob(rt.db, job);
    return false;
  }
  if ("retry" in outcome) {
    await retryMediaJobLater(rt.db, job, LOCAL_RETRY_SECONDS[job.attempts - 1] ?? 300, outcome.retry);
  } else {
    await settleMediaJob(rt.db, job, outcome.state === "done" ? outcome : { state: outcome.state, error: outcome.reason });
    const failure = outcome.state === "done" ? undefined : { ref: job.ref, reason: outcome.reason };
    await applyRefToShares(rt, job.owner_id, job.ref, failure);
  }
  const result = "retry" in outcome ? "retry" : outcome.state;
  console.log(JSON.stringify({ event: "media_job", kind: job.kind, attempt: job.attempts, result, reason: "reason" in outcome ? outcome.reason : undefined, ms: Date.now() - started }));
  return true;
}
