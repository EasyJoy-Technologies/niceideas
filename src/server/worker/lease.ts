/**
 * A claim whose lease was lost (F13): another worker claimed the item after the lease ran out, so
 * this run's writes did nothing and its result is dropped. Logged for monitoring (with one worker it
 * should never happen); returns true (the loop goes on).
 */
export function logLeaseLost(queue: "media_job" | "outbox" | "avatar_job", attempt: number, id: string): true {
  console.warn(JSON.stringify({ event: "lease_lost", queue, attempt, id }));
  return true;
}
