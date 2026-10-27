import { sql, type Kysely } from "kysely";

/**
 * One-time sign-in tickets for app WebViews (contract nicematrix-backend docs/integration/niceideas-share.md §10,
 * plan docs/plan/2026-10-26-app-sign-in-ticket.md): only the SHA-256 of a ticket is stored; valid 60 s, redeemed once.
 * Web sessions record where they came from (`web`: NiceMatrix sign-in, `app`: ticket); existing ones are `web`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE web_ticket (
      id_hash    text PRIMARY KEY,
      user_id    text NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at    timestamptz
    );
    CREATE INDEX web_ticket_expires_idx ON web_ticket (expires_at);
    ALTER TABLE web_session ADD COLUMN source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'app'));
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE web_session DROP COLUMN IF EXISTS source; DROP TABLE IF EXISTS web_ticket;`.execute(db);
}
