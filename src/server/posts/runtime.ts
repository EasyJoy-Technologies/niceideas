import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { getMediaStores } from "@/server/storage";

/** Process-wide dependencies of the post services, resolved once per request. */
export function postRuntime() {
  const cfg = getConfig();
  return { db: getDb(), stores: getMediaStores(), cacheControl: cfg.MEDIA_CACHE_CONTROL, retentionDays: cfg.POST_RETENTION_DAYS };
}
