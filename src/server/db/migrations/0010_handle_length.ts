import { sql, type Kysely } from "kysely";

/**
 * Handles follow NiceMatrix usernames (Logto: 1–128 of letters, digits, underscore;
 * stored lowercased here). Allow 1–64 so real usernames fit; longer ones keep the generated handle.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile DROP CONSTRAINT profile_handle_format;
    ALTER TABLE profile ADD CONSTRAINT profile_handle_format CHECK (handle ~ '^[a-z0-9_]{1,64}$');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile DROP CONSTRAINT profile_handle_format;
    ALTER TABLE profile ADD CONSTRAINT profile_handle_format CHECK (handle ~ '^[a-z0-9_]{3,30}$') NOT VALID;
  `.execute(db);
}
