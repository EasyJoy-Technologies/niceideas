import type { Migration, MigrationProvider } from "kysely/migration";
import * as m0001 from "./0001_initial";
import * as m0002 from "./0002_interactions";
import * as m0003 from "./0003_account_events";
import * as m0004 from "./0004_web_sessions";
import * as m0005 from "./0005_search";
import * as m0006 from "./0006_notifications";
import * as m0007 from "./0007_api_clients";
import * as m0008 from "./0008_pow_used";
import * as m0009 from "./0009_app_directory";
import * as m0010 from "./0010_handle_length";
import * as m0011 from "./0011_handle_dot";

/**
 * Static registry (bundler-friendly; no filesystem scanning at runtime).
 * Append new migrations in order; never edit or reorder applied ones.
 */
const MIGRATIONS: Record<string, Migration> = {
  "0001_initial": m0001,
  "0002_interactions": m0002,
  "0003_account_events": m0003,
  "0004_web_sessions": m0004,
  "0005_search": m0005,
  "0006_notifications": m0006,
  "0007_api_clients": m0007,
  "0008_pow_used": m0008,
  "0009_app_directory": m0009,
  "0010_handle_length": m0010,
  "0011_handle_dot": m0011,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return MIGRATIONS;
  },
};
