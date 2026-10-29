import { sql, type Kysely } from "kysely";

/**
 * Source app of app shares (contract niceideas-share.md §3.2 `sourceApp`, NiceMatrix API 1.2.769): the product
 * group key and its display names, set once when the post is created; both null when the backend sent none or
 * an invalid one (no "From …" badge then). Posts shared before this release all came from NiceNote (the only
 * product group that could share), so they are filled with NiceNote (names as in the NiceMatrix product group;
 * escaped here, the source tree carries no CJK literals).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post
      ADD COLUMN source_app_key   text CHECK (source_app_key ~ '^[a-z][a-z0-9-]{0,39}$'),
      ADD COLUMN source_app_names jsonb CHECK (jsonb_typeof(source_app_names) = 'object'),
      ADD CONSTRAINT post_source_app_pair CHECK ((source_app_key IS NULL) = (source_app_names IS NULL));
    UPDATE post SET source_app_key = 'nicenote', source_app_names = '{"en": "NiceNote", "zh-Hans": "\u4e50\u8da3\u8bb0\u4e8b\u672c", "zh-Hant": "\u6a02\u8da3\u8a18\u4e8b\u672c"}'::jsonb
      WHERE source IN ('nicenote', 'nicenote_intl', 'nicenote_cn');
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE post DROP CONSTRAINT IF EXISTS post_source_app_pair, DROP COLUMN IF EXISTS source_app_names, DROP COLUMN IF EXISTS source_app_key;
  `.execute(db);
}
