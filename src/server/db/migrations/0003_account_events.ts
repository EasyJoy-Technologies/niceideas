import { sql, type Kysely } from "kysely";

/** Processed NiceMatrix account events (plan §10), for idempotent delivery with retries. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE account_event (
      event_id     text PRIMARY KEY,
      user_id      text NOT NULL,
      event        text NOT NULL CHECK (event IN ('deletion_requested', 'deletion_cancelled', 'deletion_completed')),
      occurred_at  timestamptz NOT NULL,
      processed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX account_event_user_idx ON account_event (user_id, occurred_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS account_event`.execute(db);
}
