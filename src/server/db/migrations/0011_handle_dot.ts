import { sql, type Kysely } from "kysely";

/** Handles may contain "." (NiceMatrix usernames); a handle made only of dots is refused ("." / ".." are path segments). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile DROP CONSTRAINT profile_handle_format;
    ALTER TABLE profile ADD CONSTRAINT profile_handle_format CHECK (handle ~ '^[a-z0-9_.]{1,64}$' AND handle !~ '^\\.+$');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile DROP CONSTRAINT profile_handle_format;
    ALTER TABLE profile ADD CONSTRAINT profile_handle_format CHECK (handle ~ '^[a-z0-9_]{1,64}$') NOT VALID;
  `.execute(db);
}
