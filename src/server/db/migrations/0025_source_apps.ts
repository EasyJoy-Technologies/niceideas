import { sql, type Kysely } from "kysely";

/**
 * Source apps (contract niceideas-share.md §3.2 `sourceApp`, NiceMatrix API 1.2.769; Xianglin 2026-10-29):
 * - post: the product group key and display names a share came from, set once at creation; both null when the
 *   backend sent none or an invalid one. Posts shared before this release all came from NiceNote (the only
 *   product group that could share), so they are filled with NiceNote.
 * - source_app: our own apps by product group key. A new key is registered on its first share; "From <app>"
 *   shows only for apps turned on in the admin Apps page. NiceNote, NiceRecorder and NiceList start on, with
 *   the icons copied from the NiceMatrix admin and their websites.
 * - api_client.show_badge: third-party apps show "From <app>" only once turned on (off for existing ones).
 * - moderation_action: `app_settings` audits changes on the Apps page.
 * Chinese names are escaped (the source tree carries no CJK literals).
 */
const NICENOTE = `{"en": "NiceNote", "zh-Hans": "\u4e50\u8da3\u8bb0\u4e8b\u672c", "zh-Hant": "\u6a02\u8da3\u8a18\u4e8b\u672c"}`;
const NICERECORDER = `{"en": "NiceRecorder", "zh-Hans": "\u6613\u5f55\u97f3", "zh-Hant": "\u6613\u9304\u97f3"}`;
const NICELIST = `{"en": "NiceList", "zh-Hans": "\u5f85\u529e\u4efb\u52a1\u6e05\u5355", "zh-Hant": "\u5f85\u8fa6\u4efb\u52d9\u6e05\u55ae"}`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post
      ADD COLUMN source_app_key   text CHECK (source_app_key ~ '^[a-z][a-z0-9-]{0,39}$'),
      ADD COLUMN source_app_names jsonb CHECK (jsonb_typeof(source_app_names) = 'object'),
      ADD CONSTRAINT post_source_app_pair CHECK ((source_app_key IS NULL) = (source_app_names IS NULL));
    CREATE INDEX post_source_app_idx ON post (source_app_key, published_at DESC) WHERE source_app_key IS NOT NULL;

    CREATE TABLE source_app (
      key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9-]{0,39}$'),
      names       jsonb NOT NULL CHECK (jsonb_typeof(names) = 'object' AND jsonb_typeof(names -> 'en') = 'string'),
      show_badge  boolean NOT NULL DEFAULT false,
      website_url text CHECK (website_url ~ '^https://'),
      icon_url    text CHECK (icon_url ~ '^(https://|/brand/)'),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE api_client ADD COLUMN show_badge boolean NOT NULL DEFAULT false;
    ALTER TABLE moderation_action DROP CONSTRAINT moderation_action_action_check,
      ADD CONSTRAINT moderation_action_action_check CHECK (action IN (
        'remove', 'restore', 'hide_comment', 'restore_comment', 'delete_comment', 'ban', 'unban', 'comments_mode', 'resolve_report', 'dismiss_report', 'app_settings'));
  `.execute(db);
  await sql`
    INSERT INTO source_app (key, names, show_badge, website_url, icon_url, created_at) VALUES
      ('nicenote', ${NICENOTE}::jsonb, true, 'https://enp.ej-mobile.cn', '/brand/sources/nicenote.png', now() - interval '2 seconds'),
      ('nicerecorder', ${NICERECORDER}::jsonb, true, 'https://er.ej-mobile.cn', '/brand/sources/nicerecorder.png', now() - interval '1 second'),
      ('nicelist', ${NICELIST}::jsonb, true, 'https://ec.ej-mobile.cn', '/brand/sources/nicelist.png', now())
  `.execute(db);
  // One statement per query: parameters cannot be sent with several statements.
  await sql`UPDATE post SET source_app_key = 'nicenote', source_app_names = ${NICENOTE}::jsonb WHERE source IN ('nicenote', 'nicenote_intl', 'nicenote_cn')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM moderation_action WHERE action = 'app_settings';
    ALTER TABLE moderation_action DROP CONSTRAINT moderation_action_action_check,
      ADD CONSTRAINT moderation_action_action_check CHECK (action IN (
        'remove', 'restore', 'hide_comment', 'restore_comment', 'delete_comment', 'ban', 'unban', 'comments_mode', 'resolve_report', 'dismiss_report'));
    ALTER TABLE api_client DROP COLUMN IF EXISTS show_badge;
    DROP TABLE IF EXISTS source_app;
    DROP INDEX IF EXISTS post_source_app_idx;
    ALTER TABLE post DROP CONSTRAINT IF EXISTS post_source_app_pair, DROP COLUMN IF EXISTS source_app_names, DROP COLUMN IF EXISTS source_app_key;
  `.execute(db);
}
