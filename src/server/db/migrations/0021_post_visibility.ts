import { sql, type Kysely } from "kysely";

/**
 * Private posts (plan docs/plan/2026-10-26-private-theme-guidelines.md C): `visibility` is independent
 * of `status` (moderation, app updates and account deletion never change it). A private post is seen
 * by its author only; its media stay in the private store. Existing posts stay public.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));
    ALTER TABLE post ADD COLUMN visibility_changed_at timestamptz;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE post DROP COLUMN visibility_changed_at; ALTER TABLE post DROP COLUMN visibility;`.execute(db);
}
