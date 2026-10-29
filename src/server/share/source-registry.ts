import type { Db } from "@/server/db/client";
import type { ApiClient, SourceAppRow } from "@/server/db/schema";
import { listApiClients } from "@/server/db/repos/api-clients";
import { listSourceApps } from "@/server/db/repos/source-apps";

/**
 * Apps posts can come from, refreshed at most once a minute (and right after an admin change in this process):
 * third-party apps by client_id (posts with source `api:<client_id>`) and our own apps by product group key.
 */
const TTL_MS = 60_000;
let clients: ReadonlyMap<string, ApiClient> = new Map();
let ownApps: readonly SourceAppRow[] = [];
let ownByKey: ReadonlyMap<string, SourceAppRow> = new Map();
let loadedAt = 0;
let loading: Promise<void> | null = null;

export async function ensureSourceRegistry(db: Db): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return;
  loading ??= Promise.all([listApiClients(db), listSourceApps(db)])
    .then(([c, own]) => {
      clients = new Map(c.map((r) => [r.client_id, r]));
      ownApps = own;
      ownByKey = new Map(own.map((r) => [r.key, r]));
      loadedAt = Date.now();
    })
    .finally(() => (loading = null));
  await loading;
}

export const knownApp = (clientId: string): ApiClient | undefined => clients.get(clientId);
export const knownSourceApp = (key: string): SourceAppRow | undefined => ownByKey.get(key);
/** Our own apps in registration order. */
export const sourceAppList = (): readonly SourceAppRow[] => ownApps;

/** Forces a reload on the next request (after an admin change; tests). */
export function resetSourceRegistry(): void {
  loadedAt = 0;
}
