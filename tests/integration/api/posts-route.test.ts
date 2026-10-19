import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE, GET, PATCH } from "@/app/api/v1/posts/[id]/route";
import { PUT } from "@/app/api/v1/posts/[id]/content/route";
import { GET as sourcesRoute } from "@/app/api/v1/me/sources/route";
import { POST as mediaRoute } from "@/app/api/v1/media/route";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";
import { jpegWithExif, sha256, smallPngWithAlpha } from "../../helpers/media-fixtures";
import { AUD_CN } from "../../helpers/tokens";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
let alice: string;
let bob: string;
beforeAll(async () => {
  ctx = await startAppContext();
  alice = await ctx.tokenFor("alice");
  bob = await ctx.tokenFor("bob");
});
afterAll(async () => ctx?.stop());

const text = (t: string) => ({ version: 1, blocks: [{ type: "text", text: t }] });
const create = (token: string, body: unknown, headers?: Record<string, string>) => createRoute(jsonRequest("POST", "/api/v1/posts", token, body, headers), {});
const sync = (token: string, id: string, body: unknown) => PUT(jsonRequest("PUT", `/api/v1/posts/${id}/content`, token, body), params({ id }));
const upload = async (token: string, buf: Buffer) => {
  const res = await mediaRoute(new Request("http://x/api/v1/media", { method: "POST", body: new Uint8Array(buf), headers: { authorization: `Bearer ${token}`, "x-content-sha256": sha256(buf) } }), {});
  return (await res.json()).media.id as string;
};
const T1 = "2026-10-19T10:00:00Z";
const T2 = "2026-10-19T11:00:00Z";

describe("publish → re-share → sync → settings → withdraw", () => {
  let id: string;
  let url: string;

  it("publishes a short text note and returns the link", async () => {
    const res = await create(alice, { document: text("Hello world"), sourceRef: "note-a", sourceUpdatedAt: T1 });
    expect(res.status).toBe(201);
    const { post } = await res.json();
    expect(post).toMatchObject({ kind: "short", status: "active", source: "nicenote_intl", sourceRef: "note-a", syncMode: "follow", summary: "Hello world" });
    expect(post.url).toMatch(/^http:\/\/localhost:3000\/p\/[a-z2-9]{14}$/);
    ({ id, url } = post);
  });

  it("re-sharing the same note returns the same link (200)", async () => {
    const res = await create(alice, { document: text("different"), sourceRef: "note-a", sourceUpdatedAt: T2 });
    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({ id, url, summary: "Hello world" });
  });

  it("sync: same content no-op, newer content switches revision, older rejected", async () => {
    const same = await sync(alice, id, { document: text("Hello world"), sourceUpdatedAt: T2 });
    expect(await same.json()).toMatchObject({ changed: false });
    const img = await upload(alice, await jpegWithExif());
    const doc = { version: 1, title: "Trip", blocks: [{ type: "text", text: "x ".repeat(10) }, { type: "image", mediaId: img }] };
    const newer = await sync(alice, id, { document: doc, sourceUpdatedAt: T2 });
    expect(newer.status).toBe(200);
    expect((await newer.json())).toMatchObject({ changed: true, post: { url, kind: "article", title: "Trip", coverMediaId: img } });
    const media = await ctx.db.selectFrom("media").select("public_at").where("id", "=", img).executeTakeFirstOrThrow();
    expect(media.public_at).not.toBeNull();
    const older = await sync(alice, id, { document: text("old device"), sourceUpdatedAt: T1 });
    expect(await older.json()).toMatchObject({ error: { code: "post.stale_update", status: 409 } });
  });

  it("dropping an image in a sync withdraws it from public storage", async () => {
    const res = await sync(alice, id, { document: text("text only now"), sourceUpdatedAt: "2026-10-19T12:00:00Z" });
    expect((await res.json()).post).toMatchObject({ kind: "short", coverMediaId: null });
    const rows = await ctx.db.selectFrom("media").select(["public_at", "detached_at"]).where("owner_id", "=", "alice").execute();
    expect(rows.every((r) => r.public_at === null)).toBe(true);
  });

  it("settings: lock summary and kind, freeze, then sync is refused", async () => {
    const res = await PATCH(jsonRequest("PATCH", `/api/v1/posts/${id}`, alice, { summary: "Custom", kind: "article", syncMode: "frozen" }), params({ id }));
    expect((await res.json()).post).toMatchObject({ summary: "Custom", summaryLocked: true, kind: "article", kindLocked: true, syncMode: "frozen" });
    const frozen = await sync(alice, id, { document: text("new"), sourceUpdatedAt: "2026-10-19T13:00:00Z" });
    expect(frozen.status).toBe(409);
    const unknown = await PATCH(jsonRequest("PATCH", `/api/v1/posts/${id}`, alice, { title: "x" }), params({ id }));
    expect(unknown.status).toBe(400);
  });

  it("other users cannot see or change the post", async () => {
    expect((await GET(jsonRequest("GET", `/api/v1/posts/${id}`, bob), params({ id }))).status).toBe(404);
    expect((await DELETE(jsonRequest("DELETE", `/api/v1/posts/${id}`, bob), params({ id }))).status).toBe(404);
    expect((await GET(jsonRequest("GET", `/api/v1/posts/not-a-uuid`, alice), params({ id: "not-a-uuid" }))).status).toBe(404);
  });

  it("lists sources, withdraws idempotently with 30-day purge, then a new share gets a new link", async () => {
    const list = await (await sourcesRoute(jsonRequest("GET", "/api/v1/me/sources?source=nicenote", alice), {})).json();
    expect(list.items).toEqual([expect.objectContaining({ id, sourceRef: "note-a", syncMode: "frozen" })]);

    const del = await (await DELETE(jsonRequest("DELETE", `/api/v1/posts/${id}`, alice), params({ id }))).json();
    expect(del.post.status).toBe("unpublished");
    const days = (Date.parse(del.post.purgeAfter) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect((await DELETE(jsonRequest("DELETE", `/api/v1/posts/${id}`, alice), params({ id }))).status).toBe(200);
    expect((await sync(alice, id, { document: text("z"), sourceUpdatedAt: "2026-10-20T00:00:00Z" })).status).toBe(409);

    const again = await (await create(alice, { document: text("Hello again"), sourceRef: "note-a", sourceUpdatedAt: T2 })).json();
    expect(again.post.id).not.toBe(id);
    const after = await (await sourcesRoute(jsonRequest("GET", "/api/v1/me/sources?source=nicenote", alice), {})).json();
    expect(after.items.map((i: { id: string }) => i.id)).toEqual([again.post.id]);
  });
});

describe("validation, ownership and idempotency", () => {
  it("rejects bad bodies and foreign / wrong-kind media", async () => {
    expect((await create(alice, { document: text("x"), sourceRef: "n", sourceUpdatedAt: "yesterday" })).status).toBe(400);
    expect((await create(alice, { document: { version: 1, blocks: [] }, sourceRef: "n", sourceUpdatedAt: T1 })).status).toBe(400);
    const bobImg = await upload(bob, await smallPngWithAlpha());
    const res = await create(alice, { document: { version: 1, blocks: [{ type: "image", mediaId: bobImg }] }, sourceRef: "n2", sourceUpdatedAt: T1 });
    expect(await res.json()).toEqual({ error: { code: "document.media_invalid", status: 422, details: { mediaIds: [bobImg] } } });
    const asAudio = await create(bob, { document: { version: 1, blocks: [{ type: "audio", mediaId: bobImg }] }, sourceRef: "n3", sourceUpdatedAt: T1 });
    expect(asAudio.status).toBe(422);
    const raw = await createRoute(new Request("http://x/api/v1/posts", { method: "POST", body: "{nope", headers: { authorization: `Bearer ${alice}` } }), {});
    expect(raw.status).toBe(400);
  });

  it("cn tokens publish as nicenote_cn; same note id in both regions are separate posts", async () => {
    const cn = await ctx.tokenFor("alice", AUD_CN);
    const res = await (await create(cn, { document: text("from cn"), sourceRef: "note-cn", sourceUpdatedAt: T1 })).json();
    expect(res.post.source).toBe("nicenote_cn");
  });

  it("Idempotency-Key replays the response and rejects reuse with another body", async () => {
    const body = { document: text("idem"), sourceRef: "note-idem", sourceUpdatedAt: T1 };
    const first = await create(bob, body, { "idempotency-key": "k-1" });
    const second = await create(bob, body, { "idempotency-key": "k-1" });
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect((await second.json()).post.id).toBe((await first.json()).post.id);
    expect((await create(bob, { ...body, sourceRef: "other" }, { "idempotency-key": "k-1" })).status).toBe(422);
  });

  it("concurrent shares of one note create exactly one post", async () => {
    const body = { document: text("race"), sourceRef: "note-race", sourceUpdatedAt: T1 };
    const results = await Promise.all(Array.from({ length: 6 }, () => create(bob, body)));
    const ids = new Set(await Promise.all(results.map(async (r) => (await r.json()).post.id)));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });
});
