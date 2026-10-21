import { sql, type Kysely } from "kysely";

/**
 * Site search (plan phase 2): substring match (ILIKE) over post text and
 * profile names, served by trigram indexes. `post.search_text` = title + plain
 * body text, maintained with the other derived fields on publish / sync.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    ALTER TABLE post ADD COLUMN search_text text NOT NULL DEFAULT '';
    UPDATE post SET search_text = title || E'\n' || summary;
    CREATE INDEX post_search_trgm_idx ON post USING gin (search_text gin_trgm_ops) WHERE status = 'active';
    CREATE INDEX profile_search_trgm_idx ON profile USING gin ((handle || ' ' || display_name) gin_trgm_ops);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS profile_search_trgm_idx;
    DROP INDEX IF EXISTS post_search_trgm_idx;
    ALTER TABLE post DROP COLUMN IF EXISTS search_text;
  `.execute(db);
}
