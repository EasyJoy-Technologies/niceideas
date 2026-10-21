import type { Db } from "@/server/db/client";
import type { ApiClient } from "@/server/db/schema";
import { listApiClients } from "@/server/db/repos/api-clients";

/** External apps by source key (posts with source `api:<key>`), refreshed at most once a minute. */
const TTL_MS = 60_000;
let registry: ReadonlyMap<string, ApiClient> = new Map();
let loadedAt = 0;
let loading: Promise<void> | null = null;

export async function ensureSourceRegistry(db: Db): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return;
  loading ??= listApiClients(db)
    .then((rows) => {
      registry = new Map(rows.map((c) => [c.source_key, c]));
      loadedAt = Date.now();
    })
    .finally(() => (loading = null));
  await loading;
}

export const registeredApp = (key: string): ApiClient | undefined => registry.get(key);

/** Test hook. */
export function resetSourceRegistryForTests(): void {
  loadedAt = 0;
}
