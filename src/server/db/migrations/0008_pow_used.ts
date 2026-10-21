import { sql, type Kysely } from "kysely";

/**
 * Spent proof-of-work challenges (anonymous comments). Kept in the database so the
 * single-use rule holds across server processes; purged daily after expiry.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE pow_used (
      challenge  text PRIMARY KEY,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX pow_used_expires_idx ON pow_used (expires_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS pow_used;`.execute(db);
}
