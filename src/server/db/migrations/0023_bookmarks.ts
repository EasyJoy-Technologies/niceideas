import { sql, type Kysely } from "kysely";

/**
 * Bookmarks (plan docs/plan/2026-10-26-account-interactions-bookmarks.md): private to the user who saved
 * the post — only the number is public (`post.bookmark_count`). Removed with the post or the account.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post ADD COLUMN bookmark_count integer NOT NULL DEFAULT 0 CHECK (bookmark_count >= 0);
    CREATE TABLE post_bookmark (
      user_id    text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      post_id    uuid NOT NULL REFERENCES post (id) ON DELETE CASCADE,
      -- Millisecond precision: the page cursor carries milliseconds (no row is skipped between pages).
      created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
      PRIMARY KEY (user_id, post_id)
    );
    CREATE INDEX post_bookmark_user_recent_idx ON post_bookmark (user_id, created_at DESC, post_id DESC);
    CREATE INDEX post_bookmark_post_idx ON post_bookmark (post_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS post_bookmark; ALTER TABLE post DROP COLUMN IF EXISTS bookmark_count;`.execute(db);
}
