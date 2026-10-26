import { sql, type Kysely } from "kysely";

/**
 * Media reliability (plan docs/plan/2026-10-26-share-review-fixes.md, S2):
 * - media.visibility_due_at: when the media must be checked against its references (public or private
 *   store); a future time is a lease (a publish moving it) or a retry delay. The worker is woken when
 *   it becomes due now.
 * - media_job.refresh_due_at: the shares using a settled job still have to be refreshed.
 * - media_upload: objects being stored under a prefix before their media row exists (cleaned up when
 *   the row never comes).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE media ADD COLUMN visibility_due_at timestamptz;
    CREATE INDEX media_visibility_due_idx ON media (visibility_due_at) WHERE visibility_due_at IS NOT NULL;
    CREATE TRIGGER media_notify_work AFTER UPDATE ON media
      FOR EACH ROW WHEN (NEW.visibility_due_at IS NOT NULL AND NEW.visibility_due_at <= now() AND NEW.visibility_due_at IS DISTINCT FROM OLD.visibility_due_at)
      EXECUTE FUNCTION niceideas_notify_work();
    ALTER TABLE media_job ADD COLUMN refresh_due_at timestamptz;
    CREATE INDEX media_job_refresh_due_idx ON media_job (refresh_due_at) WHERE refresh_due_at IS NOT NULL;
    CREATE TABLE media_upload (
      prefix     text PRIMARY KEY,
      owner_id   text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX media_upload_owner_idx ON media_upload (owner_id);
    CREATE INDEX media_upload_created_idx ON media_upload (created_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS media_upload;
    DROP INDEX IF EXISTS media_job_refresh_due_idx;
    ALTER TABLE media_job DROP COLUMN IF EXISTS refresh_due_at;
    DROP TRIGGER IF EXISTS media_notify_work ON media;
    DROP INDEX IF EXISTS media_visibility_due_idx;
    ALTER TABLE media DROP COLUMN IF EXISTS visibility_due_at;
  `.execute(db);
}
