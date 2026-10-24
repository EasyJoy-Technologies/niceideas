/** Retry delays of background deliveries (contract §4.1): 1 min, 5 min, 30 min, then every hour. */
const DELAYS_SECONDS = [60, 300, 1800];

export function retryDelaySeconds(attempt: number): number {
  return DELAYS_SECONDS[attempt - 1] ?? 3600;
}

/** Retries stop 24 hours after the item was queued; it is then recorded as failed. */
export const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinRetryWindow(queuedAt: Date, now = Date.now()): boolean {
  return now - queuedAt.getTime() < RETRY_WINDOW_MS;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);
