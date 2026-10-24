import { sql, type Kysely } from "kysely";

/**
 * Background worker (plan docs/plan/2026-10-24-s2-worker.md):
 * - media_job: the ref → media mapping (`media_id`; replaces `media.source_ref`, so one stored file can
 *   serve several refs and web uploads of the same file), `rejected` = permanent failure (never fetched
 *   again for this owner and ref), due index covering expired leases.
 * - profile.avatar_source + avatar_job: avatars are downloaded and served from the public bucket.
 * - Data: existing users are queued for registration with the backend, existing avatars for download.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE media_job ADD COLUMN media_id uuid REFERENCES media (id) ON DELETE SET NULL;
    CREATE INDEX media_job_media_idx ON media_job (media_id) WHERE media_id IS NOT NULL;
    ALTER TABLE media_job DROP CONSTRAINT media_job_state_check;
    ALTER TABLE media_job ADD CONSTRAINT media_job_state_check CHECK (state IN ('pending', 'running', 'done', 'failed', 'rejected'));
    DROP INDEX media_job_due_idx;
    CREATE INDEX media_job_due_idx ON media_job (run_after) WHERE state IN ('pending', 'running');

    INSERT INTO media_job (owner_id, ref, kind, mime, state, media_id)
      SELECT owner_id, source_ref, kind, mime, 'done', id FROM media WHERE source_ref IS NOT NULL
      ON CONFLICT (owner_id, ref) DO UPDATE SET state = 'done', media_id = excluded.media_id, updated_at = now();
    DROP INDEX media_owner_ref_key;
    ALTER TABLE media DROP COLUMN source_ref;

    ALTER TABLE profile ADD COLUMN avatar_source text;
    CREATE TABLE avatar_job (
      user_id    text PRIMARY KEY REFERENCES profile (user_id) ON DELETE CASCADE,
      source_url text NOT NULL,
      state      text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'failed')),
      attempts   integer NOT NULL DEFAULT 0,
      error      text,
      run_after  timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX avatar_job_due_idx ON avatar_job (run_after) WHERE state IN ('pending', 'running');

    UPDATE profile SET avatar_source = avatar_url WHERE avatar_url IS NOT NULL;
    INSERT INTO avatar_job (user_id, source_url)
      SELECT user_id, avatar_url FROM profile WHERE avatar_url LIKE 'https://%' AND status = 'active';
    INSERT INTO outbox (kind, dedupe_key, payload)
      SELECT 'user_registered', 'user_registered:' || user_id, jsonb_build_object('userId', user_id) FROM profile WHERE status = 'active'
      ON CONFLICT (dedupe_key) DO NOTHING;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS avatar_job;
    ALTER TABLE profile DROP COLUMN IF EXISTS avatar_source;
    ALTER TABLE media ADD COLUMN source_ref text;
    CREATE UNIQUE INDEX media_owner_ref_key ON media (owner_id, source_ref) WHERE source_ref IS NOT NULL;
    UPDATE media m SET source_ref = j.ref FROM (
      SELECT DISTINCT ON (media_id) media_id, ref FROM media_job WHERE media_id IS NOT NULL ORDER BY media_id, created_at
    ) j WHERE m.id = j.media_id;
    DROP INDEX media_job_due_idx;
    CREATE INDEX media_job_due_idx ON media_job (run_after) WHERE state = 'pending';
    UPDATE media_job SET state = 'failed' WHERE state = 'rejected';
    ALTER TABLE media_job DROP CONSTRAINT media_job_state_check;
    ALTER TABLE media_job ADD CONSTRAINT media_job_state_check CHECK (state IN ('pending', 'running', 'done', 'failed'));
    DROP INDEX IF EXISTS media_job_media_idx;
    ALTER TABLE media_job DROP COLUMN media_id;
  `.execute(db);
}
