import type { Db } from "@/server/db/client";
import { claimOutboxItem, settleOutbox, type OutboxItem } from "@/server/db/repos/outbox";
import { postToBackend, type BackendAnswer } from "@/server/nicenote/backend-client";
import { logLeaseLost } from "./lease";
import { errorText, retryDelaySeconds, withinRetryWindow } from "./retry";

/** Notifications per round (each claimed just before it is sent). */
const BATCH = 20;
/** A claimed notification is due again after this if the worker dies while sending it (one send ≤ 15 s). */
const LEASE_SECONDS = 120;
/** Answers meaning the request itself is wrong: sending it again cannot help. */
const PERMANENT = new Set([400, 404, 409, 410, 413, 422]);

type Send = (item: OutboxItem) => Promise<BackendAnswer>;

/**
 * Delivers due notifications to the NiceMatrix backend (contract §4.1, §4.2): 2xx = done; a request
 * the backend refuses as invalid is recorded as failed; anything else (network, 5xx, 429, auth) is
 * retried on the schedule until 24 hours after it was queued. Returns how many were handled.
 * Without the share key nothing is sent (the queue waits). A result whose lease was lost meanwhile
 * (another worker took the item, F13) is dropped.
 */
export async function deliverOutbox(db: Db, key: string | undefined, send: Send = (i) => postToBackend(i.kind, i.payload, key!)): Promise<number> {
  if (!key) return 0;
  let handled = 0;
  for (; handled < BATCH; handled++) {
    const item = await claimOutboxItem(db, LEASE_SECONDS);
    if (!item) break;
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
    if (!(await settleOutbox(db, item, outcome))) {
      logLeaseLost("outbox", item.attempts, item.id);
      continue;
    }
    const result = ok ? resultOf(answer!.body) : "state" in outcome ? "failed" : "retry";
    console.log(JSON.stringify({ event: "outbox_delivery", kind: item.kind, id: item.id, attempt: item.attempts, status: answer?.status ?? null, result }));
  }
  return handled;
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
