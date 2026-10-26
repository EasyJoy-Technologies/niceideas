import { sql, type Kysely } from "kysely";

/**
 * Account deletion hardening (plan docs/plan/2026-10-26-share-review-fixes.md §3, §4):
 * - account_event.completed_at: an event counts as handled (duplicate) only once all its steps
 *   succeeded; a failed attempt is re-run on redelivery. Existing rows count as completed.
 * - account_event.claimed_until: short lease so two deliveries of one event do not run together.
 * - deleted_account: users whose deletion completed; no profile, post or media is created for them again.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE account_event ADD COLUMN completed_at timestamptz;
    ALTER TABLE account_event ADD COLUMN claimed_until timestamptz;
    UPDATE account_event SET completed_at = processed_at;
    CREATE TABLE deleted_account (
      user_id    text PRIMARY KEY,
      deleted_at timestamptz NOT NULL DEFAULT now()
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS deleted_account;
    ALTER TABLE account_event DROP COLUMN IF EXISTS claimed_until;
    ALTER TABLE account_event DROP COLUMN IF EXISTS completed_at;
  `.execute(db);
}
