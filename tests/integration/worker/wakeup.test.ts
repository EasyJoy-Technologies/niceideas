import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queueAvatarJob } from "@/server/db/repos/avatar-jobs";
import { enqueueOutbox, nextOutboxDueAt } from "@/server/db/repos/outbox";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { WorkWakeup } from "@/server/worker/wakeup";
import { startTestDb } from "../../helpers/pg";

let pg: Awaited<ReturnType<typeof startTestDb>>;
let wakeup: WorkWakeup;
const stop = new AbortController();

/** Resolves with the elapsed ms of a wait that would otherwise last 20 s. */
async function timedWait(topic: string): Promise<number> {
  const t = Date.now();
  await wakeup.wait(topic, 20_000, stop.signal);
  return Date.now() - t;
}
const listening = async () => {
  for (let i = 0; i < 100 && !wakeup.listening; i++) await new Promise((r) => setTimeout(r, 50));
  expect(wakeup.listening).toBe(true);
};

describe("worker wake-up (NOTIFY niceideas_work)", () => {
  beforeAll(async () => {
    pg = await startTestDb();
    wakeup = new WorkWakeup(pg.url);
    wakeup.start(stop.signal);
    await listening();
  });
  afterAll(async () => {
    stop.abort();
    await wakeup?.close();
    await pg?.stop();
  });

  it("wakes the outbox loop on commit, not on rollback, and only that loop", async () => {
    const outboxWait = timedWait("outbox");
    const avatarWait = wakeup.wait("avatar_job", 1_500, stop.signal).then(() => "timeout");
    await pg.db.transaction().execute(async (trx) => {
      await enqueueOutbox(trx, { kind: "post_event", dedupeKey: "w-1", payload: {} });
      await new Promise((r) => setTimeout(r, 300));
    });
    const ms = await outboxWait;
    expect(ms).toBeGreaterThanOrEqual(250);
    expect(ms).toBeLessThan(5_000);
    expect(await avatarWait).toBe("timeout");

    const rolledBack = Promise.race([timedWait("outbox").then(() => "woken"), new Promise((r) => setTimeout(() => r("quiet"), 1_000))]);
    await pg.db
      .transaction()
      .execute(async (trx) => {
        await enqueueOutbox(trx, { kind: "post_event", dedupeKey: "w-2", payload: {} });
        throw new Error("rollback");
      })
      .catch(() => undefined);
    expect(await rolledBack).toBe("quiet");
    wakeup.wake("outbox");
  });

  it("stays quiet for leases and retries (future run_after), wakes for avatar jobs", async () => {
    const quiet = Promise.race([timedWait("outbox").then(() => "woken"), new Promise((r) => setTimeout(() => r("quiet"), 1_000))]);
    await pg.db.updateTable("outbox").set({ run_after: new Date(Date.now() + 60_000) }).where("dedupe_key", "=", "w-1").execute();
    expect(await quiet).toBe("quiet");
    wakeup.wake("outbox");
    expect((await nextOutboxDueAt(pg.db))!.getTime()).toBeGreaterThan(Date.now() + 50_000);

    await ensureProfile(pg.db, "wake-user");
    const avatarWait = timedWait("avatar_job");
    await queueAvatarJob(pg.db, "wake-user", "https://example.com/a.png");
    expect(await avatarWait).toBeLessThan(5_000);
  });

  it("reconnects after the connection is killed and wakes every loop", async () => {
    const all = Promise.all([timedWait("outbox"), timedWait("media_job")]);
    await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query = 'LISTEN niceideas_work'`.execute(pg.db);
    const [a, b] = await all;
    expect(Math.max(a, b)).toBeLessThan(10_000);
    await listening();
  });
});
