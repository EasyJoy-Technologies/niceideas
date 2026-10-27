import { sql, type Kysely } from "kysely";

/**
 * Reposts and quotes (plan docs/plan/2026-10-27-repost-profile-tabs.md §2): a repost is a row in
 * `post_repost` (no new post; `post.repost_count` counts them), a quote is a post with `quote_of`
 * (counted from the live quotes when shown). `quote_of` has no foreign key on purpose: an original that
 * is purged leaves its quotes pointing nowhere, and they still show "no longer available" (with ON DELETE
 * SET NULL they would turn into ordinary posts). Profile "Replies": the account's comments, newest first.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post ADD COLUMN repost_count integer NOT NULL DEFAULT 0 CHECK (repost_count >= 0);
    ALTER TABLE post ADD COLUMN quote_of uuid;
    CREATE INDEX post_quote_of_idx ON post (quote_of) WHERE quote_of IS NOT NULL;
    CREATE INDEX post_author_quotes_idx ON post (author_id, published_at DESC, id DESC) WHERE quote_of IS NOT NULL;
    CREATE TABLE post_repost (
      user_id    text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      post_id    uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      -- Millisecond precision: the page cursor carries milliseconds (no row is skipped between pages).
      created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
      PRIMARY KEY (user_id, post_id)
    );
    CREATE INDEX post_repost_user_recent_idx ON post_repost (user_id, created_at DESC, post_id DESC);
    CREATE INDEX post_repost_post_idx ON post_repost (post_id, created_at DESC);
    CREATE INDEX comment_author_recent_idx ON comment (author_id, created_at DESC, id DESC) WHERE author_id IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS comment_author_recent_idx;
    DROP TABLE IF EXISTS post_repost;
    ALTER TABLE post DROP COLUMN IF EXISTS quote_of;
    ALTER TABLE post DROP COLUMN IF EXISTS repost_count;
  `.execute(db);
}
