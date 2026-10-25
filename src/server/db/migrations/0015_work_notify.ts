import { sql, type Kysely } from "kysely";

/**
 * Worker wake-up (plan docs/plan/2026-10-25-remaining-work-and-cost.md, W1): a row of outbox /
 * media_job / avatar_job that becomes due now sends NOTIFY niceideas_work with the table name.
 * NOTIFY is delivered on commit, so the worker never sees work of a rolled-back transaction,
 * and identical notifications of one transaction are folded into one. Leases and retries move
 * run_after into the future and stay silent (the worker's own timer covers them).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE FUNCTION niceideas_notify_work() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_notify('niceideas_work', TG_TABLE_NAME);
      RETURN NULL;
    END $$;
    CREATE TRIGGER outbox_notify_work AFTER INSERT OR UPDATE ON outbox
      FOR EACH ROW WHEN (NEW.state = 'pending' AND NEW.run_after <= now()) EXECUTE FUNCTION niceideas_notify_work();
    CREATE TRIGGER media_job_notify_work AFTER INSERT OR UPDATE ON media_job
      FOR EACH ROW WHEN (NEW.state = 'pending' AND NEW.run_after <= now() AND NEW.url IS NOT NULL) EXECUTE FUNCTION niceideas_notify_work();
    CREATE TRIGGER avatar_job_notify_work AFTER INSERT OR UPDATE ON avatar_job
      FOR EACH ROW WHEN (NEW.state = 'pending' AND NEW.run_after <= now()) EXECUTE FUNCTION niceideas_notify_work();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TRIGGER avatar_job_notify_work ON avatar_job;
    DROP TRIGGER media_job_notify_work ON media_job;
    DROP TRIGGER outbox_notify_work ON outbox;
    DROP FUNCTION niceideas_notify_work();
  `.execute(db);
}
