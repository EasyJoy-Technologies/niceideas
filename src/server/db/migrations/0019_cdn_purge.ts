import { sql, type Kysely } from "kysely";

/**
 * CDN purges (plan docs/plan/2026-10-26-share-review-fixes.md, F22): URLs to purge from the Cloudflare
 * edge, queued in the transaction that took their content offline and sent by the worker (woken by
 * NOTIFY niceideas_work 'cdn_purge').
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE cdn_purge (
      url        text PRIMARY KEY,
      attempts   integer NOT NULL DEFAULT 0,
      last_error text,
      run_after  timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX cdn_purge_due_idx ON cdn_purge (run_after);
    CREATE TRIGGER cdn_purge_notify_work AFTER INSERT OR UPDATE ON cdn_purge
      FOR EACH ROW WHEN (NEW.run_after <= now()) EXECUTE FUNCTION niceideas_notify_work();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS cdn_purge`.execute(db);
}
