import { sql, type Kysely } from "kysely";

/** Daily maintenance finds NiceNote shares still waiting for their first push after 30 days (run-maintenance.ts). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX post_preparing_idx ON post (published_at) WHERE status = 'preparing'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX post_preparing_idx`.execute(db);
}
