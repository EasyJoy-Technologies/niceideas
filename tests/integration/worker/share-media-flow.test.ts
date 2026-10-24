import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { resetConfigForTests } from "@/server/config/env";
import { createShare } from "@/server/nicenote/create-share";
import { pushShareContent } from "@/server/nicenote/push-content";
import { runNextMediaJob, type MediaWorkerRuntime } from "@/server/worker/media-job-runner";
import { deliverOutbox } from "@/server/worker/outbox-delivery";
import { startAppContext } from "../../helpers/app-context";
import { params } from "../../helpers/api";
import { startFakeBackend, type Reply } from "../../helpers/fake-backend";
import { hasMediaTools, tallPng, wavTone } from "../../helpers/media-fixtures";

const KEY = "w".repeat(40);
const CACHE = "public, max-age=300";
const USER = "flow-user";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let backend: Awaited<ReturnType<typeof startFakeBackend>>;
let rt: MediaWorkerRuntime;
/** Grant id → answer of the fake media endpoint (changed by the tests). */
const grants = new Map<string, () => Reply>();

const signal = new AbortController().signal;
const grant = (id: string) => ({ url: `${backend.base}/v1/internal/niceideas/media/${id}`, expiresAt: "2030-01-01T00:00:00Z" });
const image = (ref: string) => ({ type: "image", state: "ready", ref, mime: "image/png", bytes: 1 });
const audio = (ref: string) => ({ type: "audio", state: "ready", ref, mime: "audio/wav", bytes: 1, title: "Tone" });
const doc = (...blocks: unknown[]) => ({ version: 1 as const, title: "Media", blocks });
async function share(blocks: unknown[], media: Record<string, { url: string; expiresAt: string }>, revision = 1) {
  const { post } = await createShare(ctx.db, { shareId: randomUUID(), userId: USER, region: "intl", syncMode: "follow", commentsMode: null, profile: null });
  return (await pushShareContent(ctx.db, ctx.stores, CACHE, post.id, { sourceRevision: revision, document: doc(...blocks) as never, media })).post;
}
const push = (postId: string, blocks: unknown[], media: Record<string, { url: string; expiresAt: string }>, revision: number) =>
  pushShareContent(ctx.db, ctx.stores, CACHE, postId, { sourceRevision: revision, document: doc(...blocks) as never, media });
async function drain() {
  let n = 0;
  while (await runNextMediaJob(rt, signal)) n++;
  return n;
}
const post = (id: string) => ctx.db.selectFrom("post").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const job = (ref: string) => ctx.db.selectFrom("media_job").selectAll().where("owner_id", "=", USER).where("ref", "=", ref).executeTakeFirstOrThrow();
const events = async (postId: string) =>
  (await ctx.db.selectFrom("outbox").select("payload").where("kind", "=", "post_event").orderBy("created_at").execute())
    .map((r) => r.payload as { postId: string; event: string; details?: { refs: string[]; reason: string } })
    .filter((p) => p.postId === postId)
    .map((p) => (p.details ? `${p.event}:${p.details.reason}:${p.details.refs.join(",")}` : p.event));
const page = async (slug: string) => (await pageRoute(new Request(`http://localhost:3000/p/${slug}`, { headers: { "accept-language": "en" } }), params({ slug }))).text();

describe.skipIf(!hasMediaTools())("NiceNote media through the worker", () => {
  beforeAll(async () => {
    const png = await tallPng(120, 80);
    backend = await startFakeBackend(KEY, (path) => {
      const id = path.split("/media/")[1];
      if (id) return grants.get(id)?.() ?? { status: 410 };
      return { status: 200, body: JSON.stringify({ result: "applied" }) };
    });
    grants.set("png", () => ({ status: 200, body: png, headers: { "content-type": "image/png" } }));
    grants.set("wav", () => ({ status: 200, body: wavTone(), headers: { "content-type": "audio/wav" } }));
    grants.set("text", () => ({ status: 200, body: "not an image" }));
    Object.assign(process.env, { NICEMATRIX_SHARE_KEY: KEY, NICEMATRIX_API_URL: backend.base });
    ctx = await startAppContext();
    rt = { db: ctx.db, stores: ctx.stores, cacheControl: CACHE, key: KEY, maxBytes: 10_000_000, maxImagePixels: 100_000_000 };
  });
  afterAll(async () => {
    for (const k of ["NICEMATRIX_SHARE_KEY", "NICEMATRIX_API_URL"]) delete process.env[k];
    resetConfigForTests();
    await backend?.stop();
    await ctx?.stop();
  });

  it("fetches with signed requests, stores, publishes and reports: ready media show, failures are told per reason", async () => {
    const p = await share([image("r-png"), audio("r-wav"), image("r-gone"), image("r-text")], {
      "r-png": grant("png"), "r-wav": grant("wav"), "r-gone": grant("gone"), "r-text": grant("text"),
    });
    expect(p.media_state).toBe("processing");
    expect(await page(p.slug)).toContain('data-state="processing"');
    expect(await drain()).toBe(4);

    const fetched = backend.requests.filter((r) => r.path.includes("/media/"));
    expect(fetched.every((r) => r.signed && r.service === "niceideas" && r.method === "GET")).toBe(true);
    expect([(await job("r-png")).state, (await job("r-wav")).state, (await job("r-gone")).state, (await job("r-text")).state]).toEqual(["done", "done", "failed", "rejected"]);
    const after = await post(p.id);
    expect(after.media_state).toBe("partial");
    expect(after.cover_media_id).toBe((await job("r-png")).media_id);
    expect(await events(p.id)).toEqual(["media_failed:fetch_expired:r-gone", "media_failed:unsupported_format:r-text"]);
    const html = await page(p.slug);
    expect(html).toContain('<figure class="ni-image">');
    expect(html).toContain('<audio controls preload="metadata" aria-label="Tone"><source src=');
    expect(html.match(/data-state="unavailable"/g)?.length).toBe(2);
    const linked = await ctx.db.selectFrom("revision_media").select("media_id").where("revision_id", "=", after.current_revision_id!).execute();
    expect(linked).toHaveLength(2);
  });

  it("a fresh grant brings a temporary failure back (then media_ready); a permanent one is never fetched again", async () => {
    const p = await share([image("r-later")], { "r-later": grant("later") });
    await drain();
    expect((await job("r-later")).state).toBe("failed");
    grants.set("later", () => grants.get("png")!());
    const textFetches = () => backend.requests.filter((r) => r.path.endsWith("/text") || r.path.endsWith("/text2")).length;
    const before = textFetches();
    // The backend pushes again: same revision, same content, new addresses.
    const again = await push(p.id, [image("r-later"), image("r-text")], { "r-later": grant("later"), "r-text": grant("text2") }, 1);
    expect(again.post.media_state).toBe("partial");
    expect((await job("r-text")).state).toBe("rejected");
    await drain();
    expect(textFetches()).toBe(before);
    expect((await job("r-later")).state).toBe("done");
    const q = await share([image("r-later")], {});
    expect(q.media_state).toBe("complete");
    const r = await share([image("r-late2")], { "r-late2": grant("late2") });
    await drain();
    grants.set("late2", () => grants.get("png")!());
    await push(r.id, [image("r-late2")], { "r-late2": grant("late2") }, 2);
    await drain();
    expect((await post(r.id)).media_state).toBe("complete");
    expect(await events(r.id)).toEqual(["media_failed:fetch_expired:r-late2", "media_ready"]);
  });

  it("temporary problems are retried here first; a crashed run is taken over after its lease", async () => {
    let calls = 0;
    grants.set("flaky", () => (++calls === 1 ? { status: 503 } : grants.get("png")!()));
    const p = await share([image("r-flaky")], { "r-flaky": grant("flaky") });
    await drain();
    const waiting = await job("r-flaky");
    expect([waiting.state, waiting.attempts, waiting.error?.startsWith("fetch_failed")]).toEqual(["pending", 1, true]);
    expect(await events(p.id)).toEqual([]);
    await ctx.db.updateTable("media_job").set({ run_after: new Date(Date.now() - 1000) }).where("ref", "=", "r-flaky").execute();
    await drain();
    expect((await job("r-flaky")).state).toBe("done");
    expect(await events(p.id)).toEqual(["media_ready"]);

    // A worker died mid-job: the lease runs out and the job is due again.
    const q = await share([image("r-crash")], { "r-crash": grant("png") });
    await ctx.db.updateTable("media_job").set({ state: "running", run_after: new Date(Date.now() - 1000) }).where("ref", "=", "r-crash").execute();
    await drain();
    expect((await job("r-crash")).state).toBe("done");
    expect((await post(q.id)).media_state).toBe("complete");
  });

  it("delivers the queued events to the backend, signed", async () => {
    expect(await deliverOutbox(ctx.db, KEY)).toBeGreaterThan(0);
    const sent = backend.requests.filter((r) => r.path === "/v1/internal/niceideas/post-events");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((r) => r.signed && r.method === "POST")).toBe(true);
    expect(JSON.parse(sent[0].body)).toMatchObject({ event: "media_failed", details: { reason: "fetch_expired", refs: ["r-gone"] } });
  });
});
