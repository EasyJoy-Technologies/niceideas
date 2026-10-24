import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetConfigForTests } from "@/server/config/env";
import { enqueueOutbox } from "@/server/db/repos/outbox";
import { PublicFetchError } from "@/server/http/public-https";
import { followNiceMatrixProfile } from "@/server/profiles/profile-follow";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { ownAvatarKey } from "@/server/profiles/avatars";
import { runNextAvatarJob, type AvatarWorkerRuntime } from "@/server/worker/avatar-job-runner";
import { deliverOutbox } from "@/server/worker/outbox-delivery";
import { startAppContext } from "../../helpers/app-context";
import { startFakeBackend, type Reply } from "../../helpers/fake-backend";
import { smallPngWithAlpha } from "../../helpers/media-fixtures";

const KEY = "o".repeat(40);
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let backend: Awaited<ReturnType<typeof startFakeBackend>>;
let answer: (body: string) => Reply = () => ({ status: 200, body: '{"result":"applied"}' });

const outbox = (key: string) => ctx.db.selectFrom("outbox").selectAll().where("dedupe_key", "=", key).executeTakeFirstOrThrow();
const due = (key: string) => ctx.db.updateTable("outbox").set({ run_after: new Date(Date.now() - 1000) }).where("dedupe_key", "=", key).execute();

describe("background worker: notifications and avatars", () => {
  beforeAll(async () => {
    backend = await startFakeBackend(KEY, (_path, body) => answer(body));
    Object.assign(process.env, { NICEMATRIX_SHARE_KEY: KEY, NICEMATRIX_API_URL: backend.base });
    ctx = await startAppContext();
  });
  afterAll(async () => {
    for (const k of ["NICEMATRIX_SHARE_KEY", "NICEMATRIX_API_URL"]) delete process.env[k];
    resetConfigForTests();
    await backend?.stop();
    await ctx?.stop();
  });

  it("registers new users with the backend, signed; nothing is sent without the key", async () => {
    await ensureProfile(ctx.db, "reg-user");
    expect(await deliverOutbox(ctx.db, undefined)).toBe(0);
    expect(await deliverOutbox(ctx.db, KEY)).toBe(1);
    const sent = backend.requests.at(-1)!;
    expect([sent.path, sent.service, sent.signed, JSON.parse(sent.body)]).toEqual(["/v1/internal/niceideas/users", "niceideas", true, { userId: "reg-user" }]);
    expect((await outbox("user_registered:reg-user")).state).toBe("done");
  });

  it("retries on the schedule, stops on answers that cannot change, gives up after 24 hours", async () => {
    answer = () => ({ status: 503 });
    await enqueueOutbox(ctx.db, { kind: "post_event", dedupeKey: "t-retry", payload: { eventId: "e1" } });
    await deliverOutbox(ctx.db, KEY);
    const first = await outbox("t-retry");
    expect([first.state, first.attempts, first.last_error]).toEqual(["pending", 1, "HTTP 503 "]);
    expect(first.run_after.getTime() - Date.now()).toBeGreaterThan(50_000);
    await due("t-retry");
    await deliverOutbox(ctx.db, KEY);
    expect((await outbox("t-retry")).run_after.getTime() - Date.now()).toBeGreaterThan(290_000);

    await ctx.db.updateTable("outbox").set({ created_at: new Date(Date.now() - 25 * 3600_000) } as never).where("dedupe_key", "=", "t-retry").execute();
    await due("t-retry");
    await deliverOutbox(ctx.db, KEY);
    expect((await outbox("t-retry")).state).toBe("failed");

    answer = () => ({ status: 400, body: '{"error":"bad"}' });
    await enqueueOutbox(ctx.db, { kind: "post_event", dedupeKey: "t-bad", payload: { eventId: "e2" } });
    await deliverOutbox(ctx.db, KEY);
    expect((await outbox("t-bad")).state).toBe("failed");
    answer = () => ({ status: 200, body: '{"result":"applied"}' });
  });

  it("avatars: downloaded into the public bucket, replaced, removed; failures keep the current one", async () => {
    const png = await smallPngWithAlpha();
    const downloads: string[] = [];
    let fail: PublicFetchError | null = null;
    const rt: AvatarWorkerRuntime = {
      db: ctx.db,
      publicStore: ctx.stores.publicStore,
      download: async (url) => {
        downloads.push(url);
        if (fail) throw fail;
        return { contentType: "image/png", body: png };
      },
    };
    const profile = async () => ctx.db.selectFrom("profile").selectAll().where("user_id", "=", "ava-user").executeTakeFirstOrThrow();
    const exists = async (key: string) => (await ctx.stores.publicStore.getStream(key).then((s) => s.toArray())).length > 0;
    await ensureProfile(ctx.db, "ava-user");
    await followNiceMatrixProfile(ctx.db, await profile(), { avatarUrl: "https://cdn.test/one.png" });
    expect(await runNextAvatarJob(rt)).toBe(true);
    const one = ownAvatarKey((await profile()).avatar_url)!;
    expect(one).toMatch(/^a\/.+\.webp$/);
    expect(await exists(one)).toBe(true);

    await followNiceMatrixProfile(ctx.db, await profile(), { avatarUrl: "https://cdn.test/two.png" });
    await runNextAvatarJob(rt);
    const two = ownAvatarKey((await profile()).avatar_url)!;
    expect(two).not.toBe(one);
    await expect(exists(one)).rejects.toThrow();

    fail = new PublicFetchError("HTTP 404", true);
    await followNiceMatrixProfile(ctx.db, await profile(), { avatarUrl: "https://cdn.test/missing.png" });
    await runNextAvatarJob(rt);
    expect(ownAvatarKey((await profile()).avatar_url)).toBe(two);
    expect((await ctx.db.selectFrom("avatar_job").select("state").where("user_id", "=", "ava-user").executeTakeFirstOrThrow()).state).toBe("failed");

    fail = new PublicFetchError("timed out", false);
    await followNiceMatrixProfile(ctx.db, await profile(), { avatarUrl: "https://cdn.test/slow.png" });
    await runNextAvatarJob(rt);
    expect((await ctx.db.selectFrom("avatar_job").select("state").where("user_id", "=", "ava-user").executeTakeFirstOrThrow()).state).toBe("pending");

    fail = null;
    await followNiceMatrixProfile(ctx.db, await profile(), { avatarUrl: null });
    await runNextAvatarJob(rt);
    expect((await profile()).avatar_url).toBeNull();
    await expect(exists(two)).rejects.toThrow();
    expect(downloads).toEqual(["https://cdn.test/one.png", "https://cdn.test/two.png", "https://cdn.test/missing.png", "https://cdn.test/slow.png"]);
  });
});
