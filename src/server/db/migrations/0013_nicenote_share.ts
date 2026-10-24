import { sql, type Kysely } from "kysely";

/**
 * NiceNote sharing through the NiceMatrix backend (contract nicematrix-backend
 * docs/integration/niceideas-share.md; plan docs/plan/2026-10-23-nicenote-source-api.md):
 * - post: `preparing` status, `nicenote` source with share id / source revision / region / media state.
 * - media: stable NiceNote media ref (dedupe per owner).
 * - media_job: media still to fetch / process (worker, phase S2).
 * - outbox: signed notifications to the backend, retried (worker, phase S2).
 * - service_nonce: replay protection of signed service requests.
 * - profile.name_locked: the display name was changed on NiceIdeas (no longer follows NiceMatrix).
 * - account_event: `profile_updated`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post DROP CONSTRAINT post_status_check;
    ALTER TABLE post ADD CONSTRAINT post_status_check CHECK (status IN ('preparing', 'active', 'unpublished', 'removed', 'author_deleting'));
    ALTER TABLE post DROP CONSTRAINT post_source_check;
    ALTER TABLE post ADD CONSTRAINT post_source_check CHECK (source IN ('nicenote', 'nicenote_intl', 'nicenote_cn', 'web') OR source LIKE 'api:%');
    ALTER TABLE post
      ADD COLUMN share_id        uuid UNIQUE,
      ADD COLUMN source_revision bigint,
      ADD COLUMN region          text CHECK (region IN ('intl', 'cn')),
      ADD COLUMN media_state     text NOT NULL DEFAULT 'complete' CHECK (media_state IN ('complete', 'processing', 'partial'));
    ALTER TABLE post ADD CONSTRAINT post_share_fields CHECK ((source = 'nicenote') = (share_id IS NOT NULL));

    ALTER TABLE media ADD COLUMN source_ref text;
    CREATE UNIQUE INDEX media_owner_ref_key ON media (owner_id, source_ref) WHERE source_ref IS NOT NULL;

    CREATE TABLE media_job (
      owner_id       text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      ref            text NOT NULL,
      kind           text NOT NULL CHECK (kind IN ('image', 'audio')),
      mime           text NOT NULL DEFAULT '',
      bytes          bigint,
      url            text,
      url_expires_at timestamptz,
      state          text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'failed')),
      attempts       integer NOT NULL DEFAULT 0,
      error          text,
      run_after      timestamptz NOT NULL DEFAULT now(),
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, ref)
    );
    CREATE INDEX media_job_due_idx ON media_job (run_after) WHERE state = 'pending';

    CREATE TABLE outbox (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind       text NOT NULL CHECK (kind IN ('user_registered', 'post_event')),
      dedupe_key text NOT NULL UNIQUE,
      payload    jsonb NOT NULL,
      state      text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'failed')),
      attempts   integer NOT NULL DEFAULT 0,
      last_error text,
      run_after  timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX outbox_due_idx ON outbox (run_after) WHERE state = 'pending';

    CREATE TABLE service_nonce (
      nonce      text PRIMARY KEY,
      service    text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX service_nonce_expires_idx ON service_nonce (expires_at);

    ALTER TABLE profile ADD COLUMN name_locked boolean NOT NULL DEFAULT false;

    ALTER TABLE account_event DROP CONSTRAINT account_event_event_check;
    ALTER TABLE account_event ADD CONSTRAINT account_event_event_check
      CHECK (event IN ('deletion_requested', 'deletion_cancelled', 'deletion_completed', 'profile_updated'));
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM account_event WHERE event = 'profile_updated';
    ALTER TABLE account_event DROP CONSTRAINT account_event_event_check;
    ALTER TABLE account_event ADD CONSTRAINT account_event_event_check CHECK (event IN ('deletion_requested', 'deletion_cancelled', 'deletion_completed'));
    ALTER TABLE profile DROP COLUMN IF EXISTS name_locked;
    DROP TABLE IF EXISTS service_nonce;
    DROP TABLE IF EXISTS outbox;
    DROP TABLE IF EXISTS media_job;
    DROP INDEX IF EXISTS media_owner_ref_key;
    ALTER TABLE media DROP COLUMN IF EXISTS source_ref;
    DELETE FROM post WHERE source = 'nicenote' OR status = 'preparing';
    ALTER TABLE post DROP CONSTRAINT IF EXISTS post_share_fields;
    ALTER TABLE post DROP COLUMN IF EXISTS media_state, DROP COLUMN IF EXISTS region, DROP COLUMN IF EXISTS source_revision, DROP COLUMN IF EXISTS share_id;
    ALTER TABLE post DROP CONSTRAINT post_source_check;
    ALTER TABLE post ADD CONSTRAINT post_source_check CHECK (source IN ('nicenote_intl', 'nicenote_cn', 'web') OR source LIKE 'api:%');
    ALTER TABLE post DROP CONSTRAINT post_status_check;
    ALTER TABLE post ADD CONSTRAINT post_status_check CHECK (status IN ('active', 'unpublished', 'removed', 'author_deleting'));
  `.execute(db);
}
