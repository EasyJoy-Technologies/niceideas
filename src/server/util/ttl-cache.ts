/**
 * Small per-process cache with expiry and single-flight loading: concurrent misses
 * for one key share one load. A TTL of 0 disables caching (loads every time).
 * Oldest entries are evicted beyond `maxEntries`. Failed loads are not cached.
 */
export type TtlCache<V> = { get(key: string, load: () => Promise<V>): Promise<V>; clear(): void };

export function ttlCache<V>(ttlMs: () => number, maxEntries = 500): TtlCache<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  const pending = new Map<string, Promise<V>>();
  return {
    async get(key, load) {
      const ttl = ttlMs();
      if (ttl <= 0) return load();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value;
      const inflight = pending.get(key);
      if (inflight) return inflight;
      const p = load()
        .then((value) => {
          entries.delete(key);
          entries.set(key, { value, expiresAt: Date.now() + ttl });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, p);
      return p;
    },
    clear() {
      entries.clear();
    },
  };
}
