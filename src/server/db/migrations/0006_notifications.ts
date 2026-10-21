import { sql, type Kysely } from "kysely";

/**
 * Web notifications (plan §16: likes / comments in the web "Notifications" page).
 * Events are read from post_like / comment / follow; only the last-seen time is stored.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile ADD COLUMN notifications_seen_at timestamptz NOT NULL DEFAULT now();
    CREATE INDEX comment_post_all_idx ON comment (post_id, created_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS comment_post_all_idx;
    ALTER TABLE profile DROP COLUMN IF EXISTS notifications_seen_at;
  `.execute(db);
}
