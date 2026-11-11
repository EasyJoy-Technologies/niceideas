import { sql, type Kysely } from "kysely";

/**
 * Followers-only and friends-only posts (plan docs/plan/2026-11-10-audience-visibility.md): `visibility`
 * takes two more values. Only the check is widened; no row changes.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post DROP CONSTRAINT post_visibility_check;
    ALTER TABLE post ADD CONSTRAINT post_visibility_check CHECK (visibility IN ('public', 'followers', 'friends', 'private'));
  `.execute(db);
}

/** Back to public / private: followers-only and friends-only posts become private (seen by fewer people, never more). */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post DROP CONSTRAINT post_visibility_check;
    UPDATE post SET visibility = 'private' WHERE visibility IN ('followers', 'friends');
    ALTER TABLE post ADD CONSTRAINT post_visibility_check CHECK (visibility IN ('public', 'private'));
  `.execute(db);
}
