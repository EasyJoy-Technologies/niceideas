import { sql, type Kysely } from "kysely";

/**
 * Third-party API clients (plan §9, Q5): each registered Logto client gets a
 * source key (posts carry source `api:<key>`), a display name, a homepage for the
 * "From <app>" badge and an optional icon. Registered with the server-side CLI.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE api_client
      ADD COLUMN source_key   text NOT NULL UNIQUE CHECK (source_key ~ '^[a-z0-9-]{2,32}$'),
      ADD COLUMN homepage_url text NOT NULL CHECK (homepage_url ~ '^https://'),
      ADD COLUMN icon_url     text CHECK (icon_url IS NULL OR icon_url ~ '^https://');
    CREATE INDEX post_client_recent_idx ON post (api_client_id, published_at) WHERE api_client_id IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS post_client_recent_idx;
    ALTER TABLE api_client DROP COLUMN IF EXISTS icon_url, DROP COLUMN IF EXISTS homepage_url, DROP COLUMN IF EXISTS source_key;
  `.execute(db);
}
