import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimAccountEvent, releaseAccountEvent } from "@/server/db/repos/accounts";
import { claimAvatarJob, queueAvatarJob, setAvatarLeased, settleAvatarJob } from "@/server/db/repos/avatar-jobs";
import { claimCdnPurges, deleteCdnPurges, insertCdnPurges, retryCdnPurges } from "@/server/db/repos/cdn-purge";
import {
  claimMediaJob,
  claimMediaRefresh,
  deferMediaRefresh,
  extendMediaJobLease,
  finishMediaRefresh,
  releaseMediaJob,
  retryMediaJobLater,
  settleMediaJob,
} from "@/server/db/repos/media-jobs";
import { claimOutboxItem, enqueueOutbox, settleOutbox } from "@/server/db/repos/outbox";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startTestDb } from "../../helpers/pg";

/**
 * F13 (plan docs/plan/2026-10-26-f13-lease-fencing.md): a claim whose lease ran out and was taken by
 * another worker writes nothing any more; the new claim finishes normally.
 */
let pg: Awaited<ReturnType<typeof startTestDb>>;
const PAST = () => new Date(Date.now() - 1000);
const OWNER = "lease-owner";

const mediaJob = () => pg.db.selectFrom("media_job").selectAll().where("owner_id", "=", OWNER).where("ref", "=", "r").executeTakeFirstOrThrow();
const expireMedia = () => pg.db.updateTable("media_job").set({ run_after: PAST() }).where("owner_id", "=", OWNER).execute();

describe("lease fencing (F13)", () => {
  beforeAll(async () => {
    pg = await startTestDb();
    await ensureProfile(pg.db, OWNER);
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    // Claims take the oldest due item of the whole table: each test starts from empty queues.
    for (const t of ["media_job", "outbox", "avatar_job", "cdn_purge"] as const) await pg.db.deleteFrom(t).execute();
  });

  it("R-N06 inverted: an expired media claim can no longer renew, settle, retry or release the new claim's job", async () => {
    await pg.db.insertInto("media_job").values({ owner_id: OWNER, ref: "r", kind: "image", url: "https://example.test/grant" }).execute();
    const old = (await claimMediaJob(pg.db, 600))!;
    expect(old.lease_token).toMatch(/^[0-9a-f-]{36}$/);
    await expireMedia();
    const newer = (await claimMediaJob(pg.db, 600))!;
    expect([newer.attempts, newer.lease_token === old.lease_token]).toEqual([2, false]);
    const before = await mediaJob();

    expect(await extendMediaJobLease(pg.db, old, 6000)).toBe(false);
    expect(await settleMediaJob(pg.db, old, { state: "failed", error: "stale owner" })).toBeNull();
    expect(await retryMediaJobLater(pg.db, old, 1, "stale owner")).toBe(false);
    expect(await releaseMediaJob(pg.db, old)).toBe(false);
    expect(await mediaJob()).toEqual(before);

    expect(await extendMediaJobLease(pg.db, newer, 600)).toBe(true);
    const token = await settleMediaJob(pg.db, newer, { state: "failed", error: "fetch_failed" });
    expect(token).toBeInstanceOf(Date);
    const row = await mediaJob();
    expect([row.state, row.error, row.lease_token, row.refresh_due_at?.getTime()]).toEqual(["failed", "fetch_failed", null, token!.getTime()]);
    // Settled: even the claim that settled it writes nothing more.
    expect(await retryMediaJobLater(pg.db, newer, 1, "late")).toBe(false);
  });

  it("media job: retry and release of the current claim still work and end its lease", async () => {
    await pg.db.insertInto("media_job").values({ owner_id: OWNER, ref: "r", kind: "image", url: "https://example.test/grant" }).execute();
    const a = (await claimMediaJob(pg.db, 600))!;
    expect(await retryMediaJobLater(pg.db, a, 0, "fetch_failed: x")).toBe(true);
    expect(await mediaJob()).toMatchObject({ state: "pending", lease_token: null, attempts: 1 });
    const b = (await claimMediaJob(pg.db, 600))!;
    expect(await releaseMediaJob(pg.db, b)).toBe(true);
    expect(await mediaJob()).toMatchObject({ state: "pending", lease_token: null, attempts: 1 });
    expect(await releaseMediaJob(pg.db, a)).toBe(false);
  });

  it("outbox: the expired claim's outcome is dropped; the new claim settles", async () => {
    await enqueueOutbox(pg.db, { kind: "post_event", dedupeKey: "lease-1", payload: { eventId: "e" } });
    const old = (await claimOutboxItem(pg.db, 120))!;
    await pg.db.updateTable("outbox").set({ run_after: PAST() }).where("id", "=", old.id).execute();
    const newer = (await claimOutboxItem(pg.db, 120))!;
    expect([newer.id, newer.attempts]).toEqual([old.id, 2]);
    expect(await claimOutboxItem(pg.db, 120)).toBeUndefined();

    expect(await settleOutbox(pg.db, old, { state: "done" })).toBe(false);
    expect(await settleOutbox(pg.db, old, { retryInSeconds: 1, error: "x" })).toBe(false);
    expect(await settleOutbox(pg.db, old, { state: "failed", error: "x" })).toBe(false);
    const mid = await pg.db.selectFrom("outbox").selectAll().where("id", "=", old.id).executeTakeFirstOrThrow();
    expect([mid.state, mid.lease_token, mid.last_error]).toEqual(["pending", newer.lease_token, null]);

    expect(await settleOutbox(pg.db, newer, { state: "done" })).toBe(true);
    const done = await pg.db.selectFrom("outbox").selectAll().where("id", "=", old.id).executeTakeFirstOrThrow();
    expect([done.state, done.lease_token]).toEqual(["done", null]);
  });

  it("avatar job: the expired claim can neither set the avatar nor settle; a replaced job is told apart", async () => {
    const user = "lease-avatar";
    await ensureProfile(pg.db, user);
    await pg.db.updateTable("profile").set({ avatar_source: "https://cdn.test/a.png" }).where("user_id", "=", user).execute();
    await queueAvatarJob(pg.db, user, "https://cdn.test/a.png");
    const old = (await claimAvatarJob(pg.db, 120))!;
    await pg.db.updateTable("avatar_job").set({ run_after: PAST() }).where("user_id", "=", user).execute();
    const newer = (await claimAvatarJob(pg.db, 120))!;

    expect(await setAvatarLeased(pg.db, old, "https://cdn.test/a.png", "https://media.test/old.webp")).toBe(false);
    expect(await settleAvatarJob(pg.db, old, { state: "done" })).toBe("lost");
    expect(await settleAvatarJob(pg.db, old, { retryInSeconds: 1, error: "x" })).toBe("lost");
    const avatar = () => pg.db.selectFrom("profile").select("avatar_url").where("user_id", "=", user).executeTakeFirstOrThrow();
    expect((await avatar()).avatar_url).toBeNull();

    expect(await setAvatarLeased(pg.db, newer, "https://cdn.test/a.png", "https://media.test/new.webp")).toBe(true);
    expect(await settleAvatarJob(pg.db, newer, { state: "done" })).toBe("settled");
    expect((await avatar()).avatar_url).toBe("https://media.test/new.webp");
    const row = await pg.db.selectFrom("avatar_job").selectAll().where("user_id", "=", user).executeTakeFirstOrThrow();
    expect([row.state, row.lease_token]).toEqual(["done", null]);

    // A newer source replacing the running job is not a lost lease (single worker, as before).
    await queueAvatarJob(pg.db, user, "https://cdn.test/a.png");
    const c = (await claimAvatarJob(pg.db, 120))!;
    await queueAvatarJob(pg.db, user, "https://cdn.test/b.png");
    expect(await settleAvatarJob(pg.db, c, { state: "done" })).toBe("replaced");
  });

  it("share refresh and CDN purge tokens (unchanged): an older token finishes, defers, deletes or retries nothing", async () => {
    await pg.db.insertInto("media_job").values({ owner_id: OWNER, ref: "r", kind: "image", url: "https://example.test/grant" }).execute();
    const job = (await claimMediaJob(pg.db, 600))!;
    const t1 = (await settleMediaJob(pg.db, job, { state: "failed", error: "fetch_failed" }))!;
    const t2 = (await claimMediaRefresh(pg.db, 300))!.refresh_due_at!;
    await finishMediaRefresh(pg.db, job, t1);
    await deferMediaRefresh(pg.db, job, t1, 1);
    expect((await mediaJob()).refresh_due_at?.getTime()).toBe(t2.getTime());
    await pg.db.updateTable("media_job").set({ refresh_due_at: PAST() }).where("owner_id", "=", OWNER).execute();
    const t3 = (await claimMediaRefresh(pg.db, 300))!.refresh_due_at!;
    await finishMediaRefresh(pg.db, job, t2);
    expect((await mediaJob()).refresh_due_at?.getTime()).toBe(t3.getTime());
    await finishMediaRefresh(pg.db, job, t3);
    expect((await mediaJob()).refresh_due_at).toBeNull();

    await insertCdnPurges(pg.db, ["https://niceideas.test/a"]);
    const [a] = await claimCdnPurges(pg.db, 10, 60);
    await pg.db.updateTable("cdn_purge").set({ run_after: PAST() }).execute();
    const [b] = await claimCdnPurges(pg.db, 10, 60);
    await deleteCdnPurges(pg.db, [a]);
    await retryCdnPurges(pg.db, [a], 1, "stale");
    const purge = await pg.db.selectFrom("cdn_purge").selectAll().executeTakeFirstOrThrow();
    expect([purge.run_after.getTime(), purge.last_error, purge.attempts]).toEqual([b.run_after.getTime(), null, 2]);
    await deleteCdnPurges(pg.db, [b]);
    expect(await pg.db.selectFrom("cdn_purge").selectAll().execute()).toEqual([]);
  });

  it("account event: releasing an expired claim leaves the lease of the delivery that took it over", async () => {
    const e = { eventId: "lease-evt", userId: OWNER, event: "deletion_requested" as const, occurredAt: new Date() };
    const a = await claimAccountEvent(pg.db, e, 600);
    expect(a.state).toBe("claimed");
    await pg.db.updateTable("account_event").set({ claimed_until: PAST() }).where("event_id", "=", e.eventId).execute();
    const b = await claimAccountEvent(pg.db, e, 600);
    if (a.state !== "claimed" || b.state !== "claimed") throw new Error("not claimed");
    const lease = async () => (await pg.db.selectFrom("account_event").select("claimed_until").where("event_id", "=", e.eventId).executeTakeFirstOrThrow()).claimed_until;
    await releaseAccountEvent(pg.db, e.eventId, a.until);
    expect((await lease())?.getTime()).toBe(b.until.getTime());
    expect((await claimAccountEvent(pg.db, e, 600)).state).toBe("busy");
    await releaseAccountEvent(pg.db, e.eventId, b.until);
    expect(await lease()).toBeNull();
  });
});
