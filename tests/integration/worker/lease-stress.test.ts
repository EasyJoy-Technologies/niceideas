import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "kysely";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetConfigForTests } from "@/server/config/env";
import { queueAvatarJob } from "@/server/db/repos/avatar-jobs";
import { enqueueOutbox } from "@/server/db/repos/outbox";
import { mediaKeys } from "@/server/media/keys";
import { ownAvatarKey } from "@/server/profiles/avatars";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { LocalStore } from "@/server/storage/local-store";
import { startFakeBackend, type Reply } from "../../helpers/fake-backend";
import { smallPngWithAlpha } from "../../helpers/media-fixtures";
import { startTestDb } from "../../helpers/pg";

/**
 * F13 acceptance (plan docs/plan/2026-10-26-f13-lease-fencing.md §7): two worker processes share one
 * PostgreSQL and run 100 media jobs, 100 notifications and 100 avatar jobs while the test lets
 * running leases expire (each claim at most once). Every item ends correctly, exactly once, with
 * nothing lost, stuck or left behind in the stores.
 */
const N = 100;
const KEY = "s".repeat(40);
const OWNER = "stress-owner";
const ROOT = path.resolve(import.meta.dirname, "../../..");
let pg: Awaited<ReturnType<typeof startTestDb>>;
let backend: Awaited<ReturnType<typeof startFakeBackend>>;
const pngs = new Map<string, Buffer>();
const slow = <T>(v: T) => delay(20 + Math.random() * 130).then(() => v);

/** Counts every move of a row into a final state (one per item expected). */
const TERMINAL_LOG = sql`
  CREATE TABLE stress_terminal (tbl text NOT NULL, id text NOT NULL, state text NOT NULL);
  CREATE FUNCTION stress_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    INSERT INTO stress_terminal VALUES (TG_TABLE_NAME,
      coalesce(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'user_id', (to_jsonb(NEW)->>'owner_id') || '/' || (to_jsonb(NEW)->>'ref')), NEW.state);
    RETURN NULL;
  END $$;
  CREATE TRIGGER media_job_stress AFTER UPDATE ON media_job FOR EACH ROW
    WHEN (NEW.state IN ('done', 'failed', 'rejected') AND OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION stress_terminal();
  CREATE TRIGGER outbox_stress AFTER UPDATE ON outbox FOR EACH ROW
    WHEN (NEW.state IN ('done', 'failed') AND OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION stress_terminal();
  CREATE TRIGGER avatar_job_stress AFTER UPDATE ON avatar_job FOR EACH ROW
    WHEN (NEW.state IN ('done', 'failed') AND OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION stress_terminal();
`;

/** Claims currently holding a lease, per queue: key → token. */
async function leasedClaims(): Promise<{ q: "media_job" | "outbox" | "avatar_job"; key: string; token: string }[]> {
  const r = await sql<{ q: "media_job" | "outbox" | "avatar_job"; key: string; token: string }>`
    SELECT 'media_job' AS q, ref AS key, lease_token::text AS token FROM media_job WHERE state = 'running' AND lease_token IS NOT NULL
    UNION ALL SELECT 'outbox', id::text, lease_token::text FROM outbox WHERE state = 'pending' AND lease_token IS NOT NULL
    UNION ALL SELECT 'avatar_job', user_id, lease_token::text FROM avatar_job WHERE state = 'running' AND lease_token IS NOT NULL`.execute(pg.db);
  return r.rows;
}

/** Lets the lease of that exact claim run out now (another worker may take the item). */
async function expire(c: { q: string; key: string; token: string }): Promise<void> {
  const col = { media_job: "ref", outbox: "id", avatar_job: "user_id" }[c.q]!;
  await sql`UPDATE ${sql.table(c.q)} SET run_after = now() - interval '1 second' WHERE ${sql.ref(col)}::text = ${c.key} AND lease_token = ${c.token}::uuid`.execute(pg.db);
}

const unfinished = async () =>
  Number(
    (
      await sql<{ n: string }>`
    SELECT (SELECT count(*) FROM media_job WHERE state NOT IN ('done', 'failed', 'rejected') OR refresh_due_at IS NOT NULL)
         + (SELECT count(*) FROM outbox WHERE state = 'pending')
         + (SELECT count(*) FROM avatar_job WHERE state NOT IN ('done', 'failed')) AS n`.execute(pg.db)
    ).rows[0].n,
  );

describe("two worker processes on one database (F13 stress)", () => {
  beforeAll(async () => {
    for (let i = 0; i < N; i++) pngs.set(`g${i}`, await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: i, g: 255 - i, b: 7 } } }).png().toBuffer());
    backend = await startFakeBackend(KEY, (p): Reply | Promise<Reply> => {
      const id = p.split("/media/")[1];
      if (id) return slow(pngs.has(id) ? { status: 200, body: pngs.get(id), headers: { "content-type": "image/png" } } : { status: 410 });
      return slow({ status: 200, body: '{"result":"applied"}' });
    });
    process.env.NICEMATRIX_SHARE_KEY = KEY;
    process.env.NICEMATRIX_API_URL = backend.base;
    pg = await startTestDb();
    process.env.DATABASE_URL = pg.url;
    resetConfigForTests();
  });
  afterAll(async () => {
    for (const k of ["NICEMATRIX_SHARE_KEY", "NICEMATRIX_API_URL"]) delete process.env[k];
    resetConfigForTests();
    await backend?.stop();
    await pg?.stop();
  });

  it("every media job, notification and avatar ends once and correctly while leases are taken over", { timeout: 180_000 }, async () => {
    await TERMINAL_LOG.execute(pg.db);
    await ensureProfile(pg.db, OWNER);
    for (let i = 0; i < N; i++) {
      await pg.db.insertInto("media_job").values({ owner_id: OWNER, ref: `g${i}`, kind: "image", url: `${backend.base}/v1/internal/niceideas/media/g${i}` }).execute();
      await enqueueOutbox(pg.db, { kind: "post_event", dedupeKey: `stress-${i}`, payload: { n: i } });
      const user = `stress-u${i}`;
      await ensureProfile(pg.db, user);
      await pg.db.updateTable("profile").set({ avatar_source: `https://cdn.test/${user}.png` }).where("user_id", "=", user).execute();
      await queueAvatarJob(pg.db, user, `https://cdn.test/${user}.png`);
    }
    // ensureProfile queued a registration per user: delivered by the workers too.
    const outboxTotal = Number((await pg.db.selectFrom("outbox").select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow()).n);
    const root = mkdtempSync(path.join(os.tmpdir(), "ni-stress-"));
    const avatarPng = path.join(root, "avatar.png");
    writeFileSync(avatarPng, await smallPngWithAlpha());

    const logs: string[] = [];
    const env = { ...process.env, DATABASE_URL: pg.url, APP_ENV: "test", STRESS_ROOT: root, STRESS_AVATAR: avatarPng };
    const workers: ChildProcess[] = [0, 1].map(() => {
      const child = spawn(process.execPath, ["--import", "tsx", path.join(ROOT, "tests/helpers/lease-stress-worker.ts")], { cwd: ROOT, env });
      child.stdout!.on("data", (d: Buffer) => logs.push(...d.toString().split("\n").filter(Boolean)));
      child.stderr!.on("data", (d: Buffer) => logs.push(...d.toString().split("\n").filter(Boolean)));
      return child;
    });

    const expired = new Map<string, number>([["media_job", 0], ["outbox", 0], ["avatar_job", 0]]);
    const seen = new Set<string>();
    const started = Date.now();
    try {
      while ((await unfinished()) > 0) {
        if (Date.now() - started > 120_000 || workers.some((w) => w.exitCode !== null))
          throw new Error(`not finished: ${await unfinished()} left; log tail:\n${logs.slice(-15).join("\n")}`);
        for (const c of await leasedClaims()) {
          const item = `${c.q}:${c.key}`;
          if (seen.has(item) || Math.random() > 0.4) continue;
          seen.add(item);
          await expire(c);
          expired.set(c.q, expired.get(c.q)! + 1);
        }
        await delay(10);
      }
    } finally {
      await Promise.all(workers.map((w) => (w.exitCode !== null ? null : new Promise((resolve) => (w.once("exit", resolve), w.kill("SIGTERM"))))));
    }

    // Leases were really taken over in every queue, and the stale claims noticed it.
    for (const [q, n] of expired) expect(n, q).toBeGreaterThanOrEqual(10);
    const parsed = logs.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as { event: string; queue?: string });
    expect(parsed.filter((l) => l.event === "worker_error")).toEqual([]);
    expect(logs.filter((l) => !l.startsWith("{"))).toEqual([]);
    const lost = parsed.filter((l) => l.event === "lease_lost");
    expect(lost.length).toBeGreaterThan(0);
    console.log(JSON.stringify({ stress: { expired: Object.fromEntries(expired), leaseLost: lost.length, ms: Date.now() - started } }));

    // Exactly one final transition per item.
    const terminal = (await sql<{ tbl: string; id: string; n: number }>`SELECT tbl, id, count(*)::int AS n FROM stress_terminal GROUP BY tbl, id`.execute(pg.db)).rows;
    expect(terminal.filter((t) => t.n !== 1)).toEqual([]);
    expect(terminal.filter((t) => t.tbl === "media_job")).toHaveLength(N);
    expect(terminal.filter((t) => t.tbl === "outbox")).toHaveLength(outboxTotal);
    expect(terminal.filter((t) => t.tbl === "avatar_job")).toHaveLength(N);

    // Media: all stored, one row per file, private objects = objects of the rows (losers cleaned up).
    const jobs = await pg.db.selectFrom("media_job").selectAll().execute();
    expect(jobs.filter((j) => j.state !== "done" || j.lease_token !== null || !j.media_id)).toEqual([]);
    const media = await pg.db.selectFrom("media").selectAll().where("owner_id", "=", OWNER).execute();
    expect(new Set(jobs.map((j) => j.media_id)).size).toBe(N);
    expect(media).toHaveLength(N);
    const privateStore = new LocalStore(path.join(root, "private"));
    expect((await privateStore.listKeys("")).sort()).toEqual(media.flatMap((m) => mediaKeys(m)).sort());
    expect(await pg.db.selectFrom("media_upload").selectAll().execute()).toEqual([]);

    // Notifications: all delivered, no lease left.
    expect(await pg.db.selectFrom("outbox").select(["id", "state"]).where((eb) => eb.or([eb("state", "<>", "done"), eb("lease_token", "is not", null)])).execute()).toEqual([]);

    // Avatars: every profile shows its own stored avatar; no other avatar object is left.
    expect(await pg.db.selectFrom("avatar_job").select(["user_id", "state"]).where((eb) => eb.or([eb("state", "<>", "done"), eb("lease_token", "is not", null)])).execute()).toEqual([]);
    const profiles = await pg.db.selectFrom("profile").select(["user_id", "avatar_url"]).where("user_id", "like", "stress-u%").execute();
    const keys = profiles.map((p) => ownAvatarKey(p.avatar_url));
    expect(keys.filter((k) => !k)).toEqual([]);
    expect((await new LocalStore(path.join(root, "public")).listKeys("")).sort()).toEqual((keys as string[]).sort());
  });
});
