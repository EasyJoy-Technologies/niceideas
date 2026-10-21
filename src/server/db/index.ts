import { getConfig } from "@/server/config/env";
import { createDb, type Db } from "./client";

const globalForDb = globalThis as unknown as { __niceideasDb?: Db };

/** Process-wide database handle (one pool per process, survives dev HMR). */
export function getDb(): Db {
  if (!globalForDb.__niceideasDb) {
    globalForDb.__niceideasDb = createDb(getConfig().DATABASE_URL, getConfig().DB_POOL_MAX);
  }
  return globalForDb.__niceideasDb;
}

/** Test hook: close the process-wide pool (before the test database stops). */
export async function closeDbForTests(): Promise<void> {
  await globalForDb.__niceideasDb?.destroy();
  globalForDb.__niceideasDb = undefined;
}
