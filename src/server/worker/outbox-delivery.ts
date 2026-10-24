import type { Db } from "@/server/db/client";
import { claimOutbox, settleOutbox, type OutboxItem } from "@/server/db/repos/outbox";
import { postToBackend, type BackendAnswer } from "@/server/nicenote/backend-client";
import { errorText, retryDelaySeconds, withinRetryWindow } from "./retry";

const BATCH = 20;
/** A claimed notification is due again after this if the worker dies while sending it. */
const LEASE_SECONDS = 120;
/** Answers meaning the request itself is wrong: sending it again cannot help. */
const PERMANENT = new Set([400, 404, 409, 410, 413, 422]);

type Send = (item: OutboxItem) => Promise<BackendAnswer>;

/**
 * Delivers due notifications to the NiceMatrix backend (contract §4.1, §4.2): 2xx = done; a request
 * the backend refuses as invalid is recorded as failed; anything else (network, 5xx, 429, auth) is
 * retried on the schedule until 24 hours after it was queued. Returns how many were handled.
 * Without the share key nothing is sent (the queue waits).
 */
export async function deliverOutbox(db: Db, key: string | undefined, send: Send = (i) => postToBackend(i.kind, i.payload, key!)): Promise<number> {
  if (!key) return 0;
  const items = await claimOutbox(db, BATCH, LEASE_SECONDS);
  for (const item of items) {
    let answer: BackendAnswer | null = null;
    let error = "";
    try {
      answer = await send(item);
      error = `HTTP ${answer.status} ${answer.body.slice(0, 200)}`;
    } catch (err) {
      error = errorText(err);
    }
    const ok = !!answer && answer.status >= 200 && answer.status < 300;
    const outcome = ok
      ? ({ state: "done" } as const)
      : answer && PERMANENT.has(answer.status)
        ? ({ state: "failed", error } as const)
        : withinRetryWindow(item.created_at)
          ? { retryInSeconds: retryDelaySeconds(item.attempts), error }
          : ({ state: "failed", error: `gave up: ${error}` } as const);
    await settleOutbox(db, item.id, outcome);
    const result = ok ? resultOf(answer!.body) : "state" in outcome ? "failed" : "retry";
    console.log(JSON.stringify({ event: "outbox_delivery", kind: item.kind, id: item.id, attempt: item.attempts, status: answer?.status ?? null, result }));
  }
  return items.length;
}

/** The backend's `result` / `registered` field, for the log only. */
function resultOf(body: string): string {
  try {
    const j = JSON.parse(body) as { result?: unknown; registered?: unknown };
    return typeof j.result === "string" ? j.result : j.registered === true ? "registered" : "ok";
  } catch {
    return "ok";
  }
}
