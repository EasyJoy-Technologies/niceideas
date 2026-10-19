import type { Db } from "./client";
import { Migrator } from "kysely/migration";
import { migrationProvider } from "./migrations";

/**
 * Applies pending migrations. Kysely takes an advisory lock, so concurrent
 * runners are safe. Throws on the first failure (the failing migration is rolled back).
 */
export async function migrateToLatest(db: Db): Promise<string[]> {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error, results } = await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === "Error");
  if (error || failed) {
    throw new Error(`migration failed at ${failed?.migrationName ?? "unknown"}: ${String(error)}`);
  }
  return (results ?? []).filter((r) => r.status === "Success").map((r) => r.migrationName);
}
