import { sql, type Kysely } from "kysely";

/**
 * Lease fencing (plan docs/plan/2026-10-26-f13-lease-fencing.md, F13): every claim of a media job,
 * outbox notification or avatar job gets a new `lease_token`; later writes of that claim (renew,
 * settle, retry, release) only apply while the token is still theirs. Existing rows have none.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE media_job ADD COLUMN lease_token uuid;
    ALTER TABLE outbox ADD COLUMN lease_token uuid;
    ALTER TABLE avatar_job ADD COLUMN lease_token uuid;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE avatar_job DROP COLUMN IF EXISTS lease_token;
    ALTER TABLE outbox DROP COLUMN IF EXISTS lease_token;
    ALTER TABLE media_job DROP COLUMN IF EXISTS lease_token;
  `.execute(db);
}
