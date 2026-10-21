import { describe, expect, it, vi } from "vitest";
import { ttlCache } from "@/server/util/ttl-cache";

describe("ttlCache", () => {
  it("serves hits until expiry and shares concurrent loads", async () => {
    vi.useFakeTimers();
    const cache = ttlCache<number>(() => 1000);
    let loads = 0;
    const load = async () => ++loads;
    const [a, b] = await Promise.all([cache.get("k", load), cache.get("k", load)]);
    expect([a, b, loads]).toEqual([1, 1, 1]);
    expect(await cache.get("k", load)).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(await cache.get("k", load)).toBe(2);
    vi.useRealTimers();
  });

  it("does not cache failures, honours ttl 0 and evicts the oldest entry", async () => {
    const cache = ttlCache<string>(() => 60_000, 2);
    await expect(cache.get("x", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await cache.get("x", async () => "ok")).toBe("ok");
    await cache.get("y", async () => "y");
    await cache.get("z", async () => "z");
    expect(await cache.get("x", async () => "reloaded")).toBe("reloaded");
    const off = ttlCache<number>(() => 0);
    let n = 0;
    await off.get("k", async () => ++n);
    expect(await off.get("k", async () => ++n)).toBe(2);
  });
});
