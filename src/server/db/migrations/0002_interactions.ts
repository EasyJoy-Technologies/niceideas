import { sql, type Kysely } from "kysely";

/**
 * Post-page interactions (plan §16.2): likes (signed-in or guest), comments with
 * one reply level (signed-in or anonymous), reports on posts / comments, bans of
 * anonymous visitors, and audited moderation of comments.
 *
 * Visitors are identified only by keyed one-way hashes (`visitor_key` from the
 * browser cookie, `ip_hash` from the network address); raw values are never stored.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post
      ADD COLUMN like_count    integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
      ADD COLUMN comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
      ADD COLUMN comments_mode text NOT NULL DEFAULT 'open' CHECK (comments_mode IN ('open', 'signed_in', 'closed'));

    CREATE TABLE post_like (
      post_id     uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      liker_key   text NOT NULL,
      user_id     text REFERENCES profile (user_id) ON DELETE CASCADE,
      ip_hash     text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, liker_key)
    );
    CREATE INDEX post_like_user_idx ON post_like (user_id) WHERE user_id IS NOT NULL;
    CREATE INDEX post_like_ip_recent_idx ON post_like (ip_hash, created_at);

    CREATE TABLE comment (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id      uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      parent_id    uuid REFERENCES comment (id) ON DELETE CASCADE,
      author_id    text REFERENCES profile (user_id) ON DELETE CASCADE,
      visitor_key  text,
      anon_name    text CHECK (anon_name IS NULL OR length(anon_name) <= 40),
      ip_hash      text NOT NULL,
      body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
      status       text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
      like_count   integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
      created_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT comment_has_author CHECK (author_id IS NOT NULL OR visitor_key IS NOT NULL)
    );
    CREATE INDEX comment_post_idx ON comment (post_id, created_at) WHERE parent_id IS NULL;
    CREATE INDEX comment_parent_idx ON comment (parent_id, created_at) WHERE parent_id IS NOT NULL;
    CREATE INDEX comment_ip_recent_idx ON comment (ip_hash, created_at);
    CREATE INDEX comment_visitor_recent_idx ON comment (visitor_key, created_at) WHERE visitor_key IS NOT NULL;
    CREATE INDEX comment_author_idx ON comment (author_id) WHERE author_id IS NOT NULL;

    CREATE TABLE comment_like (
      comment_id  uuid NOT NULL REFERENCES comment (id) ON DELETE CASCADE,
      liker_key   text NOT NULL,
      user_id     text REFERENCES profile (user_id) ON DELETE CASCADE,
      ip_hash     text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, liker_key)
    );
    CREATE INDEX comment_like_ip_recent_idx ON comment_like (ip_hash, created_at);

    -- Reports may target a comment; anonymous reporters are keyed by visitor hash.
    ALTER TABLE report
      ADD COLUMN comment_id   uuid REFERENCES comment (id) ON DELETE CASCADE,
      ADD COLUMN reporter_key text,
      ADD COLUMN ip_hash      text;
    CREATE UNIQUE INDEX report_once_per_reporter ON report (post_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid), reporter_key)
      WHERE reporter_key IS NOT NULL AND status = 'open';

    CREATE TABLE visitor_ban (
      kind        text NOT NULL CHECK (kind IN ('visitor', 'ip')),
      key_hash    text NOT NULL,
      reason      text NOT NULL,
      created_by  text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      expires_at  timestamptz,
      PRIMARY KEY (kind, key_hash)
    );

    -- Moderation audit covers comments, bans and comment settings too.
    ALTER TABLE moderation_action
      ALTER COLUMN post_id DROP NOT NULL,
      ADD COLUMN comment_id uuid REFERENCES comment (id) ON DELETE SET NULL,
      ADD COLUMN detail     text NOT NULL DEFAULT '',
      DROP CONSTRAINT moderation_action_action_check,
      ADD CONSTRAINT moderation_action_action_check CHECK (action IN (
        'remove', 'restore', 'hide_comment', 'restore_comment', 'delete_comment', 'ban', 'unban', 'comments_mode', 'resolve_report', 'dismiss_report'));
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM moderation_action WHERE action NOT IN ('remove', 'restore');
    ALTER TABLE moderation_action DROP CONSTRAINT moderation_action_action_check,
      ADD CONSTRAINT moderation_action_action_check CHECK (action IN ('remove', 'restore')),
      DROP COLUMN detail, DROP COLUMN comment_id;
    DELETE FROM moderation_action WHERE post_id IS NULL;
    ALTER TABLE moderation_action ALTER COLUMN post_id SET NOT NULL;
    DROP TABLE IF EXISTS visitor_ban;
    DROP INDEX IF EXISTS report_once_per_reporter;
    ALTER TABLE report DROP COLUMN ip_hash, DROP COLUMN reporter_key, DROP COLUMN comment_id;
    DROP TABLE IF EXISTS comment_like, comment, post_like;
    ALTER TABLE post DROP COLUMN comments_mode, DROP COLUMN comment_count, DROP COLUMN like_count;
  `.execute(db);
}
