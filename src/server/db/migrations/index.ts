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
import * as m0012 from "./0012_admin_member";
import * as m0013 from "./0013_nicenote_share";
import * as m0014 from "./0014_share_worker";
import * as m0015 from "./0015_work_notify";
import * as m0016 from "./0016_post_edits";
import * as m0017 from "./0017_account_deletion_fence";
import * as m0018 from "./0018_media_reliability";
import * as m0019 from "./0019_cdn_purge";
import * as m0020 from "./0020_lease_tokens";
import * as m0021 from "./0021_post_visibility";

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
  "0012_admin_member": m0012,
  "0013_nicenote_share": m0013,
  "0014_share_worker": m0014,
  "0015_work_notify": m0015,
  "0016_post_edits": m0016,
  "0017_account_deletion_fence": m0017,
  "0018_media_reliability": m0018,
  "0019_cdn_purge": m0019,
  "0020_lease_tokens": m0020,
  "0021_post_visibility": m0021,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return MIGRATIONS;
  },
};
