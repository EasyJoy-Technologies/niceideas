import { sql } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/server/config/env";
import { claimAvatarJob, queueAvatarJob } from "@/server/db/repos/avatar-jobs";
import { claimMediaJob, releaseMediaJob } from "@/server/db/repos/media-jobs";
import { enqueueOutbox } from "@/server/db/repos/outbox";
import { ingestShareMedia } from "@/server/media/ingest-share";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { ownAvatarKey } from "@/server/profiles/avatars";
import type { ObjectStore } from "@/server/storage/types";
import { removeTempDir } from "@/server/util/temp-file";
import { runNextAvatarJob } from "@/server/worker/avatar-job-runner";
import { runNextMediaJob, type MediaWorkerRuntime } from "@/server/worker/media-job-runner";
import { deliverOutbox } from "@/server/worker/outbox-delivery";
import { startAppContext } from "../../helpers/app-context";
import { startFakeBackend, type Reply } from "../../helpers/fake-backend";
import { smallPngWithAlpha, spooled } from "../../helpers/media-fixtures";

/** F13 (plan docs/plan/2026-10-26-f13-lease-fencing.md): the runners after a lost lease, and the outbox lease. */
const KEY = "f".repeat(40);
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let backend: Awaited<ReturnType<typeof startFakeBackend>>;
/** Answers a held grant request (set while one waits). */
let answerHeld: ((r: Reply) => void) | null = null;
const PAST = () => new Date(Date.now() - 1000);
const leaseLost = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as { event: string; queue: string }).filter((l) => l.event === "lease_lost");
const allKeys = async (store: ObjectStore) => (await store.listKeys("")).sort();

describe("worker runners after a lost lease (F13)", () => {
  beforeAll(async () => {
    backend = await startFakeBackend(KEY, (path) =>
      path.endsWith("/media/held") ? new Promise<Reply>((resolve) => (answerHeld = resolve)) : { status: 200, body: '{"result":"applied"}' },
    );
    Object.assign(process.env, { NICEMATRIX_SHARE_KEY: KEY, NICEMATRIX_API_URL: backend.base });
    ctx = await startAppContext();
  });
  afterAll(async () => {
    answerHeld?.({ status: 410 });
    for (const k of ["NICEMATRIX_SHARE_KEY", "NICEMATRIX_API_URL"]) delete process.env[k];
    resetConfigForTests();
    await backend?.stop();
    await ctx?.stop();
  });
  beforeEach(async () => {
    for (const t of ["media_job", "outbox", "avatar_job"] as const) await ctx.db.deleteFrom(t).execute();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("media: a failed lease renewal stops the download; nothing is stored, refreshed or settled", async () => {
    const owner = "lr-media";
    await ensureProfile(ctx.db, owner);
    await ctx.db.insertInto("media_job").values({ owner_id: owner, ref: "r", kind: "image", url: `${backend.base}/v1/internal/niceideas/media/held` }).execute();
    const rt: MediaWorkerRuntime = { db: ctx.db, stores: ctx.stores, cacheControl: "no-store", key: KEY, maxBytes: 10_000_000, maxImagePixels: 100_000_000 };
    const warn = vi.spyOn(console, "warn");
    const objectsBefore = await allKeys(ctx.stores.privateStore);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const run = runNextMediaJob(rt, new AbortController().signal);
    await vi.waitFor(() => expect(answerHeld).not.toBeNull(), { timeout: 5000 });

    // The lease ran out (stalled worker): another worker takes the job.
    await ctx.db.updateTable("media_job").set({ run_after: PAST() }).where("owner_id", "=", owner).execute();
    const other = (await claimMediaJob(ctx.db, 600))!;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await run).toBe(true);

    const row = await ctx.db.selectFrom("media_job").selectAll().where("owner_id", "=", owner).executeTakeFirstOrThrow();
    expect([row.state, row.attempts, row.lease_token, row.refresh_due_at, row.media_id]).toEqual(["running", 2, other.lease_token, null, null]);
    expect(leaseLost(warn)).toEqual([expect.objectContaining({ queue: "media_job" })]);
    expect(await allKeys(ctx.stores.privateStore)).toEqual(objectsBefore);
    expect(await ctx.db.selectFrom("media_upload").selectAll().where("owner_id", "=", owner).execute()).toEqual([]);
    answerHeld!({ status: 410 });
    answerHeld = null;
    expect(await releaseMediaJob(ctx.db, other)).toBe(true);
  });

  it("media: storing stops when the lease is lost meanwhile; written objects are removed", async () => {
    const owner = "lr-ingest";
    await ensureProfile(ctx.db, owner);
    const lease = new AbortController();
    const real: ObjectStore = ctx.stores.privateStore;
    // The lease is lost while the renditions are being written.
    const store = Object.assign(Object.create(real) as ObjectStore, {
      putFile: (...a: Parameters<ObjectStore["putFile"]>) => {
        lease.abort();
        return real.putFile(...a);
      },
    });
    const before = await allKeys(real);
    const file = spooled(await smallPngWithAlpha());
    try {
      await expect(ingestShareMedia(ctx.db, store, { ownerId: owner, kind: "image", file, maxImagePixels: 100_000_000, lease: lease.signal })).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await removeTempDir(file.dir);
    }
    expect(await allKeys(real)).toEqual(before);
    expect(await ctx.db.selectFrom("media").selectAll().where("owner_id", "=", owner).execute()).toEqual([]);
    expect(await ctx.db.selectFrom("media_upload").selectAll().where("owner_id", "=", owner).execute()).toEqual([]);
  });

  it("avatar: a stalled worker's avatar is not used and is deleted again; the next claim stores it", async () => {
    const user = "lr-avatar";
    const source = "https://cdn.test/lr.png";
    await ensureProfile(ctx.db, user);
    await ctx.db.updateTable("profile").set({ avatar_source: source }).where("user_id", "=", user).execute();
    await queueAvatarJob(ctx.db, user, source);
    const png = await smallPngWithAlpha();
    const warn = vi.spyOn(console, "warn");
    const before = await allKeys(ctx.stores.publicStore);
    let stalled = true;
    const download = async () => {
      if (stalled) {
        // While downloading, the lease runs out and another worker claims the job.
        stalled = false;
        await ctx.db.updateTable("avatar_job").set({ run_after: PAST() }).where("user_id", "=", user).execute();
        expect(await claimAvatarJob(ctx.db, 120)).toBeDefined();
      }
      return { contentType: "image/png", body: png };
    };
    expect(await runNextAvatarJob({ db: ctx.db, publicStore: ctx.stores.publicStore, download })).toBe(true);
    expect(leaseLost(warn)).toEqual([expect.objectContaining({ queue: "avatar_job" })]);
    expect((await ctx.db.selectFrom("profile").select("avatar_url").where("user_id", "=", user).executeTakeFirstOrThrow()).avatar_url).toBeNull();
    expect(await allKeys(ctx.stores.publicStore)).toEqual(before);

    // That claim's worker died too: the job is taken once more and finishes normally.
    await ctx.db.updateTable("avatar_job").set({ run_after: PAST() }).where("user_id", "=", user).execute();
    expect(await runNextAvatarJob({ db: ctx.db, publicStore: ctx.stores.publicStore, download })).toBe(true);
    const key = ownAvatarKey((await ctx.db.selectFrom("profile").select("avatar_url").where("user_id", "=", user).executeTakeFirstOrThrow()).avatar_url);
    expect(await allKeys(ctx.stores.publicStore)).toEqual([...before, key].sort());
    expect(await ctx.db.selectFrom("avatar_job").select(["state", "lease_token", "attempts"]).where("user_id", "=", user).executeTakeFirstOrThrow()).toEqual({ state: "done", lease_token: null, attempts: 3 });
  });

  it("outbox: with every send taking 15 s, no claimed notification falls due in a round of 20; oldest first", async () => {
    for (let i = 0; i < 25; i++) await enqueueOutbox(ctx.db, { kind: "post_event", dedupeKey: `lr-${i}`, payload: { n: i } });
    const sent: number[] = [];
    let dueWhileSending = 0;
    const send = async (item: { payload: unknown }) => {
      // 15 seconds pass (the backend timeout): every time in the queue moves 15 s into the past.
      await sql`UPDATE outbox SET run_after = run_after - interval '15 seconds', created_at = created_at - interval '15 seconds'`.execute(ctx.db);
      // What a second worker could take now: a claimed notification must not be among it.
      const r = await ctx.db.selectFrom("outbox").select((eb) => eb.fn.countAll<string>().as("n")).where("lease_token", "is not", null).where("state", "=", "pending").where("run_after", "<=", new Date()).executeTakeFirstOrThrow();
      dueWhileSending += Number(r.n);
      sent.push((item.payload as { n: number }).n);
      return { status: 200, body: '{"result":"applied"}' };
    };
    expect(await deliverOutbox(ctx.db, KEY, send)).toBe(20);
    expect(dueWhileSending).toBe(0);
    expect(sent).toEqual([...Array(20).keys()]);
    const rows = await ctx.db.selectFrom("outbox").select(["state", "attempts", "lease_token"]).where("dedupe_key", "like", "lr-%").orderBy("created_at").execute();
    expect(rows.slice(0, 20).every((r) => r.state === "done" && r.attempts === 1 && r.lease_token === null)).toBe(true);
    expect(rows.slice(20).every((r) => r.state === "pending" && r.attempts === 0)).toBe(true);
  });
});
