import { setTimeout as delay } from "node:timers/promises";
import { errorText } from "./retry";

const ERROR_PAUSE_MS = 10_000;

/** Waits `ms`, or less when `signal` aborts (never throws). */
export async function pause(ms: number, signal: AbortSignal): Promise<void> {
  await delay(ms, undefined, { signal }).catch(() => undefined);
}

/**
 * Runs `tick` until `signal` aborts: again at once while it finds work, after `idle()` resolves
 * when it found none, after a short pause when it failed (logged; the loop keeps going).
 */
export async function pollLoop(name: string, tick: () => Promise<boolean>, opts: { idle: () => Promise<void>; signal: AbortSignal }): Promise<void> {
  while (!opts.signal.aborted) {
    let worked: boolean;
    try {
      worked = await tick();
    } catch (err) {
      console.error(JSON.stringify({ event: "worker_error", loop: name, error: errorText(err) }));
      await pause(ERROR_PAUSE_MS, opts.signal);
      continue;
    }
    if (!worked)
      await opts.idle().catch(async (err: unknown) => {
        console.error(JSON.stringify({ event: "worker_error", loop: name, stage: "idle", error: errorText(err) }));
        await pause(ERROR_PAUSE_MS, opts.signal);
      });
  }
}

/** Idle polling while the wake-up connection is down (the pre-NOTIFY behaviour). */
export const FALLBACK_POLL_MS = 2_000;
/** Longest idle wait while listening: catches expired leases and anything a notification missed. */
export const SAFETY_CHECK_MS = 60_000;
const MIN_WAIT_MS = 1_000;

/** How long an idle loop sleeps: until its next scheduled item (retry, lease end), at most a minute. */
export function idleDelayMs(listening: boolean, nextDueAt: Date | null, now = Date.now()): number {
  if (!listening) return FALLBACK_POLL_MS;
  if (!nextDueAt) return SAFETY_CHECK_MS;
  return Math.min(SAFETY_CHECK_MS, Math.max(MIN_WAIT_MS, nextDueAt.getTime() - now));
}
