import { sql, type Kysely } from "kysely";

/**
 * Web editing (plan docs/plan/2026-10-26-web-edit.md):
 * - edited_at: content changed after publishing (web edit, app update or re-share); shows "Edited".
 * - web_edited: the author edited on the web since the app's last update; an app update carrying the
 *   same version (a retry) then leaves the web edit in place, only a newer version replaces it.
 * Data: posts (not NiceNote shares) with several revisions count as edited at their latest revision.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post ADD COLUMN edited_at timestamptz;
    ALTER TABLE post ADD COLUMN web_edited boolean NOT NULL DEFAULT false;
    UPDATE post p SET edited_at = r.created_at
      FROM post_revision r
      WHERE r.id = p.current_revision_id AND p.source <> 'nicenote' AND r.revision_no > 1;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE post DROP COLUMN web_edited; ALTER TABLE post DROP COLUMN edited_at;`.execute(db);
}
