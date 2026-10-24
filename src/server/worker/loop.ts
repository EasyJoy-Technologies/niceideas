import { setTimeout as delay } from "node:timers/promises";
import { errorText } from "./retry";

const ERROR_PAUSE_MS = 10_000;

/** Waits `ms`, or less when `signal` aborts (never throws). */
export async function pause(ms: number, signal: AbortSignal): Promise<void> {
  await delay(ms, undefined, { signal }).catch(() => undefined);
}

/**
 * Runs `tick` until `signal` aborts: again at once while it finds work, after `idleMs` when it
 * found none, after a short pause when it failed (logged; the loop keeps going).
 */
export async function pollLoop(name: string, tick: () => Promise<boolean>, opts: { idleMs: number; signal: AbortSignal }): Promise<void> {
  while (!opts.signal.aborted) {
    let worked: boolean;
    try {
      worked = await tick();
    } catch (err) {
      console.error(JSON.stringify({ event: "worker_error", loop: name, error: errorText(err) }));
      await pause(ERROR_PAUSE_MS, opts.signal);
      continue;
    }
    if (!worked) await pause(opts.idleMs, opts.signal);
  }
}
