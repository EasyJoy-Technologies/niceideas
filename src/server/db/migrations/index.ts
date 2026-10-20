import type { Migration, MigrationProvider } from "kysely/migration";
import * as m0001 from "./0001_initial";
import * as m0002 from "./0002_interactions";

/**
 * Static registry (bundler-friendly; no filesystem scanning at runtime).
 * Append new migrations in order; never edit or reorder applied ones.
 */
const MIGRATIONS: Record<string, Migration> = {
  "0001_initial": m0001,
  "0002_interactions": m0002,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return MIGRATIONS;
  },
};
