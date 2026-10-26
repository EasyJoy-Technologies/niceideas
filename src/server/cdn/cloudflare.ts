/**
 * Cloudflare cache purge by URL (F22). The zone is found once per host from the token itself (the
 * zone whose name is the host or a parent domain of it), so no zone id is configured.
 */
export type CloudflareConfig = { token: string; apiUrl: string };

/** Cloudflare accepts at most 30 URLs per purge request (all plans). */
export const MAX_URLS_PER_PURGE = 30;

type Envelope<T> = { success: boolean; result: T; errors?: { code: number; message: string }[] };

const zoneIds = new Map<string, string>();

async function call<T>(cfg: CloudflareConfig, path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await fetch(`${cfg.apiUrl.replace(/\/+$/, "")}/${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: ["Bearer", cfg.token].join(" "), "content-type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) throw new Error(`cloudflare ${path.split("?")[0]} ${res.status} ${JSON.stringify(json?.errors ?? []).slice(0, 200)}`);
  return json.result;
}

/** Zone id for a host: the host itself, then each parent domain (media.niceideas.app → niceideas.app). */
export async function zoneIdFor(cfg: CloudflareConfig, host: string): Promise<string> {
  const known = zoneIds.get(host);
  if (known) return known;
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join(".");
    const zones = await call<{ id: string; name: string }[]>(cfg, `zones?name=${encodeURIComponent(name)}`);
    if (zones[0]) {
      zoneIds.set(host, zones[0].id);
      return zones[0].id;
    }
  }
  throw new Error(`cloudflare: no zone for ${host}`);
}

/** Purges URLs (grouped by zone, ≤ 30 per request). Throws on any failure (the caller retries). */
export async function purgeUrls(cfg: CloudflareConfig, urls: string[]): Promise<void> {
  const byZone = new Map<string, string[]>();
  for (const url of urls) {
    const zone = await zoneIdFor(cfg, new URL(url).hostname);
    byZone.set(zone, [...(byZone.get(zone) ?? []), url]);
  }
  for (const [zone, list] of byZone) {
    for (let i = 0; i < list.length; i += MAX_URLS_PER_PURGE) {
      await call(cfg, `zones/${zone}/purge_cache`, { method: "POST", body: { files: list.slice(i, i + MAX_URLS_PER_PURGE) } });
    }
  }
}

/** Test hook: forget discovered zones. */
export function resetZoneCacheForTests(): void {
  zoneIds.clear();
}
