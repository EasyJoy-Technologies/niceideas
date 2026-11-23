import { sql, type Kysely } from "kysely";

/**
 * "Anyone with the link" posts and admin visibility changes (plan docs/plan/2026-11-23-link-visibility.md):
 * `post.visibility` takes `link`; the audit log takes `visibility`. Only the checks are widened; no row changes.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post DROP CONSTRAINT post_visibility_check;
    ALTER TABLE post ADD CONSTRAINT post_visibility_check CHECK (visibility IN ('public', 'link', 'followers', 'friends', 'private'));
    ALTER TABLE moderation_action DROP CONSTRAINT moderation_action_action_check,
      ADD CONSTRAINT moderation_action_action_check CHECK (action IN (
        'remove', 'restore', 'hide_comment', 'restore_comment', 'delete_comment', 'ban', 'unban', 'comments_mode', 'resolve_report', 'dismiss_report', 'app_settings', 'visibility'));
  `.execute(db);
}

/** Back: link posts become private (seen by fewer people, never more); admin visibility changes leave the audit log. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM moderation_action WHERE action = 'visibility';
    ALTER TABLE moderation_action DROP CONSTRAINT moderation_action_action_check,
      ADD CONSTRAINT moderation_action_action_check CHECK (action IN (
        'remove', 'restore', 'hide_comment', 'restore_comment', 'delete_comment', 'ban', 'unban', 'comments_mode', 'resolve_report', 'dismiss_report', 'app_settings'));
    ALTER TABLE post DROP CONSTRAINT post_visibility_check;
    UPDATE post SET visibility = 'private' WHERE visibility = 'link';
    ALTER TABLE post ADD CONSTRAINT post_visibility_check CHECK (visibility IN ('public', 'followers', 'friends', 'private'));
  `.execute(db);
}
