import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb, type Db } from "@/server/db/client";
import { migrateToLatest } from "@/server/db/migrate";

/** Starts a disposable PostgreSQL 17 (same major as staging/prod) and migrates it. */
export async function startTestDb(): Promise<{ db: Db; url: string; stop: () => Promise<void> }> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  const db = createDb(url, 5);
  await migrateToLatest(db);
  return {
    db,
    url,
    stop: async () => {
      await db.destroy();
      await container.stop();
    },
  };
}
