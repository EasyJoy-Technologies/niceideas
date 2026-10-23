import { sql, type Kysely } from "kysely";

/**
 * Admin console members beyond the bootstrap owners (ADMIN_USER_IDS, always "admin").
 * Roles: admin (everything), moderator (moderation actions), viewer (read only).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE admin_member (
      user_id    text PRIMARY KEY,
      role       text NOT NULL CHECK (role IN ('admin', 'moderator', 'viewer')),
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX visitor_ban_expires_idx ON visitor_ban (expires_at) WHERE expires_at IS NOT NULL;
    CREATE INDEX moderation_action_created_idx ON moderation_action (created_at DESC);
    CREATE INDEX report_closed_idx ON report (resolved_at DESC) WHERE status <> 'open';
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS report_closed_idx;
    DROP INDEX IF EXISTS moderation_action_created_idx;
    DROP INDEX IF EXISTS visitor_ban_expires_idx;
    DROP TABLE IF EXISTS admin_member;
  `.execute(db);
}
