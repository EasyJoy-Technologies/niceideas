import type { Db } from "@/server/db/client";
import type { ApiClient } from "@/server/db/schema";
import { listApiClients } from "@/server/db/repos/api-clients";

/** Known third-party apps by client_id (posts with source `api:<client_id>`), refreshed at most once a minute. */
const TTL_MS = 60_000;
let registry: ReadonlyMap<string, ApiClient> = new Map();
let loadedAt = 0;
let loading: Promise<void> | null = null;

export async function ensureSourceRegistry(db: Db): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return;
  loading ??= listApiClients(db)
    .then((rows) => {
      registry = new Map(rows.map((c) => [c.client_id, c]));
      loadedAt = Date.now();
    })
    .finally(() => (loading = null));
  await loading;
}

export const knownApp = (clientId: string): ApiClient | undefined => registry.get(clientId);

/** Test hook. */
export function resetSourceRegistryForTests(): void {
  loadedAt = 0;
}
