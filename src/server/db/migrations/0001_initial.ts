import { sql, type Kysely } from "kysely";

/** Initial schema (platform plan §5, phase 1 architecture §5). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE profile (
      user_id      text PRIMARY KEY,
      handle       text NOT NULL,
      display_name text NOT NULL DEFAULT '',
      avatar_url   text,
      bio          text NOT NULL DEFAULT '',
      locale       text,
      status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleting')),
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT profile_handle_format CHECK (handle ~ '^[a-z0-9_]{3,30}$')
    );
    CREATE UNIQUE INDEX profile_handle_key ON profile (handle);

    CREATE TABLE api_client (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id  text NOT NULL UNIQUE,
      name       text NOT NULL,
      status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      rate_tier  text NOT NULL DEFAULT 'standard',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE media (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id    text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      sha256      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      kind        text NOT NULL CHECK (kind IN ('image', 'audio')),
      mime        text NOT NULL,
      byte_size   bigint NOT NULL CHECK (byte_size > 0),
      width       integer,
      height      integer,
      duration_ms integer,
      variants    jsonb NOT NULL,
      public_at   timestamptz,
      detached_at timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX media_owner_sha_key ON media (owner_id, sha256);
    CREATE INDEX media_detached_idx ON media (detached_at) WHERE detached_at IS NOT NULL;

    CREATE TABLE post (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                text NOT NULL UNIQUE CHECK (length(slug) >= 12),
      author_id           text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      kind                text NOT NULL CHECK (kind IN ('short', 'article')),
      kind_locked         boolean NOT NULL DEFAULT false,
      status              text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'unpublished', 'removed', 'author_deleting')),
      source              text NOT NULL CHECK (source IN ('nicenote_intl', 'nicenote_cn', 'web') OR source LIKE 'api:%'),
      source_ref          text,
      api_client_id       uuid REFERENCES api_client (id),
      sync_mode           text NOT NULL DEFAULT 'follow' CHECK (sync_mode IN ('follow', 'frozen')),
      title               text NOT NULL DEFAULT '',
      summary             text NOT NULL DEFAULT '',
      summary_locked      boolean NOT NULL DEFAULT false,
      cover_media_id      uuid REFERENCES media (id) ON DELETE SET NULL,
      cover_locked        boolean NOT NULL DEFAULT false,
      current_revision_id uuid,
      source_updated_at   timestamptz,
      published_at        timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      status_changed_at   timestamptz,
      status_reason       text,
      purge_after         timestamptz,
      CONSTRAINT post_purge_only_when_offline CHECK (purge_after IS NULL OR status IN ('unpublished', 'removed'))
    );
    -- One live publication per source item (re-sharing returns the existing link).
    CREATE UNIQUE INDEX post_live_source_key ON post (author_id, source, source_ref)
      WHERE source_ref IS NOT NULL AND status IN ('active', 'author_deleting');
    CREATE INDEX post_author_published_idx ON post (author_id, published_at DESC) WHERE status = 'active';
    CREATE INDEX post_timeline_idx ON post (published_at DESC, id) WHERE status = 'active';
    CREATE INDEX post_purge_idx ON post (purge_after) WHERE purge_after IS NOT NULL;

    CREATE TABLE post_revision (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id           uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      revision_no       integer NOT NULL CHECK (revision_no >= 1),
      document          jsonb NOT NULL,
      content_hash      text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      source_updated_at timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (post_id, revision_no)
    );
    ALTER TABLE post ADD CONSTRAINT post_current_revision_fk
      FOREIGN KEY (current_revision_id) REFERENCES post_revision (id) DEFERRABLE INITIALLY DEFERRED;

    CREATE TABLE revision_media (
      revision_id uuid NOT NULL REFERENCES post_revision (id) ON DELETE CASCADE,
      media_id    uuid NOT NULL REFERENCES media (id) ON DELETE RESTRICT,
      PRIMARY KEY (revision_id, media_id)
    );
    CREATE INDEX revision_media_media_idx ON revision_media (media_id);

    CREATE TABLE follow (
      follower_id text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      followee_id text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (follower_id, followee_id),
      CHECK (follower_id <> followee_id)
    );
    CREATE INDEX follow_followee_idx ON follow (followee_id);

    CREATE TABLE report (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id     uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      reporter_id text REFERENCES profile (user_id) ON DELETE SET NULL,
      reason      text NOT NULL,
      detail      text NOT NULL DEFAULT '',
      status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      resolved_by text
    );
    CREATE INDEX report_open_idx ON report (created_at) WHERE status = 'open';

    CREATE TABLE moderation_action (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      actor_id   text NOT NULL,
      action     text NOT NULL CHECK (action IN ('remove', 'restore')),
      reason     text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX moderation_action_post_idx ON moderation_action (post_id, created_at);

    CREATE TABLE idempotency (
      scope           text NOT NULL,
      key             text NOT NULL,
      request_hash    text NOT NULL,
      status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
      response_status integer,
      response_body   jsonb,
      created_at      timestamptz NOT NULL DEFAULT now(),
      expires_at      timestamptz NOT NULL,
      PRIMARY KEY (scope, key)
    );
    CREATE INDEX idempotency_expires_idx ON idempotency (expires_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS idempotency, moderation_action, report, follow, revision_media;
    ALTER TABLE IF EXISTS post DROP CONSTRAINT IF EXISTS post_current_revision_fk;
    DROP TABLE IF EXISTS post_revision, post, media, api_client, profile;
  `.execute(db);
}
