import { sql, type Kysely } from "kysely";

/**
 * Third-party apps come from the NiceMatrix app directory (no manual registration):
 * `api_client` becomes directory cache (name, logo, website, directory status) + local
 * policy (block, per-app rate, note). Rows are created on first sight; posts carry
 * source `api:<client_id>`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE api_client DROP COLUMN source_key;
    ALTER TABLE api_client RENAME COLUMN homepage_url TO website_url;
    ALTER TABLE api_client RENAME COLUMN icon_url TO logo_url;
    ALTER TABLE api_client ALTER COLUMN website_url DROP NOT NULL;
    ALTER TABLE api_client
      ADD COLUMN dir_status     text NOT NULL DEFAULT 'active' CHECK (dir_status IN ('active', 'suspended')),
      ADD COLUMN fetched_at     timestamptz,
      ADD COLUMN note           text NOT NULL DEFAULT '',
      ADD COLUMN posts_per_hour integer CHECK (posts_per_hour IS NULL OR posts_per_hour > 0);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE api_client DROP COLUMN posts_per_hour, DROP COLUMN note, DROP COLUMN fetched_at, DROP COLUMN dir_status;
    UPDATE api_client SET website_url = 'https://invalid.example' WHERE website_url IS NULL;
    ALTER TABLE api_client ALTER COLUMN website_url SET NOT NULL;
    ALTER TABLE api_client RENAME COLUMN logo_url TO icon_url;
    ALTER TABLE api_client RENAME COLUMN website_url TO homepage_url;
    ALTER TABLE api_client ADD COLUMN source_key text;
    UPDATE api_client SET source_key = left(regexp_replace(lower(client_id), '[^a-z0-9-]', '-', 'g'), 32);
    ALTER TABLE api_client ALTER COLUMN source_key SET NOT NULL, ADD UNIQUE (source_key);
  `.execute(db);
}
