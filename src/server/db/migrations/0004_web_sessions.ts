import { sql, type Kysely } from "kysely";

/**
 * Web sign-in sessions (plan §3: server-side OIDC, HttpOnly session cookie).
 * Only a SHA-256 hash of the cookie value is stored. Deleting a profile
 * (account deletion) removes its sessions.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE web_session (
      id_hash      text PRIMARY KEY,
      user_id      text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      created_at   timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      expires_at   timestamptz NOT NULL
    );
    CREATE INDEX web_session_user_idx ON web_session (user_id);
    CREATE INDEX web_session_expires_idx ON web_session (expires_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS web_session`.execute(db);
}
