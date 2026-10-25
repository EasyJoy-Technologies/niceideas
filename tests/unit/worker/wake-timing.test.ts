import { describe, expect, it } from "vitest";
import { FALLBACK_POLL_MS, idleDelayMs, SAFETY_CHECK_MS } from "@/server/worker/loop";

describe("worker idle delay", () => {
  const now = 1_000_000;
  it("polls every 2 s while the wake-up connection is down", () => {
    expect(idleDelayMs(false, new Date(now + 30_000), now)).toBe(FALLBACK_POLL_MS);
  });
  it("sleeps until the next scheduled item, at least 1 s and at most a minute", () => {
    expect(idleDelayMs(true, null, now)).toBe(SAFETY_CHECK_MS);
    expect(idleDelayMs(true, new Date(now + 5_000), now)).toBe(5_000);
    expect(idleDelayMs(true, new Date(now + 600_000), now)).toBe(SAFETY_CHECK_MS);
    expect(idleDelayMs(true, new Date(now - 5_000), now)).toBe(1_000);
  });
});

describe("worker wake-up bookkeeping", () => {
  it("a wake while the loop is busy makes its next wait return at once", async () => {
    const { WorkWakeup } = await import("@/server/worker/wakeup");
    const w = new WorkWakeup("postgres://unused");
    const signal = new AbortController().signal;
    w.wake("outbox");
    const t = Date.now();
    await w.wait("outbox", 5_000, signal);
    expect(Date.now() - t).toBeLessThan(100);
    const late = w.wait("outbox", 200, signal).then(() => Date.now() - t);
    expect(await late).toBeGreaterThanOrEqual(150);
  });
});
