import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/internal/v1/nicenote/posts/route";
import { DELETE, GET, PATCH } from "@/app/api/internal/v1/nicenote/posts/[id]/route";
import { PUT } from "@/app/api/internal/v1/nicenote/posts/[id]/content/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { resetConfigForTests } from "@/server/config/env";
import { removePost } from "@/server/moderation/admin";
import { serviceHeaders } from "@/server/service-auth/signature";
import { startAppContext } from "../../helpers/app-context";
import { params } from "../../helpers/api";
import { jpegWithExif } from "../../helpers/media-fixtures";
import { publishAs, uploadAs } from "../../helpers/publish";
import { NICENOTE_APP, NICERECORDER_APP } from "../../helpers/source-app";

const KEY = "k".repeat(40);
const SERVICE = "nicematrix-test";
const BASE = "http://localhost:3000/api/internal/v1/nicenote";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  Object.assign(process.env, { NICEMATRIX_SHARE_KEY: KEY, NICEMATRIX_SHARE_SERVICES: SERVICE, NICEMATRIX_API_URL: "https://api.test" });
  ctx = await startAppContext();
});
afterAll(async () => {
  for (const k of ["NICEMATRIX_SHARE_KEY", "NICEMATRIX_SHARE_SERVICES", "NICEMATRIX_API_URL"]) delete process.env[k];
  resetConfigForTests();
  await ctx?.stop();
});

/** A request signed like the NiceMatrix backend signs it (path + query + raw body). */
function signed(method: string, path: string, body?: unknown, opts: { key?: string; service?: string; headers?: Record<string, string> } = {}) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers = { ...serviceHeaders(opts.key ?? KEY, opts.service ?? SERVICE, method, `/api/internal/v1/nicenote${path}`, raw), ...(raw ? { "content-type": "application/json" } : {}), ...opts.headers };
  return new Request(`${BASE}${path}`, { method, headers, body: raw || undefined });
}
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const create = (body: Record<string, unknown>) => createRoute(signed("POST", "/posts", body), {});
const push = (id: string, body: unknown) => PUT(signed("PUT", `/posts/${id}/content`, body), params({ id }));
const page = async (slug: string) => {
  const res = await pageRoute(new Request(`http://localhost:3000/p/${slug}`, { headers: { "accept-language": "en" } }), params({ slug }));
  return { status: res.status, html: await res.text() };
};
const share = (userId: string, extra: Record<string, unknown> = {}) => ({ shareId: randomUUID(), userId, region: "cn", syncMode: "follow", commentsMode: null, sourceApp: NICENOTE_APP, ...extra });
const doc = (...blocks: unknown[]) => ({ version: 1, title: "Weekend hike", blocks });

describe("NiceNote source API: signatures", () => {
  it("rejects unsigned, wrong key, unknown caller, stale and replayed requests", async () => {
    const body = share("sig-user");
    expect((await json(await createRoute(new Request(`${BASE}/posts`, { method: "POST", body: JSON.stringify(body) }), {}))).body.error.code).toBe("signature.invalid");
    expect((await json(await createRoute(signed("POST", "/posts", body, { key: "x".repeat(40) }), {}))).body.error.code).toBe("signature.invalid");
    expect((await json(await createRoute(signed("POST", "/posts", body, { service: "someone" }), {}))).status).toBe(403);
    expect((await json(await createRoute(signed("POST", "/posts", body, { headers: { "x-nm-timestamp": "1700000000" } }), {}))).body.error.code).toBe("signature.expired");
    const once = signed("POST", "/posts", body);
    const replay = new Request(once.url, { method: "POST", headers: once.headers, body: JSON.stringify(body) });
    expect((await create(body)).status).toBe(201);
    expect((await createRoute(once, {})).status).toBe(200);
    expect((await json(await createRoute(replay, {}))).body.error.code).toBe("nonce.replayed");
  });
});

describe("NiceNote source API: share lifecycle", () => {
  let post: { id: string; url: string; status: string };
  const body = share("nn-user", { profile: { username: "Nn.Writer", name: "Nn Writer", avatarUrl: null } });

  it("creates a preparing post idempotently by shareId; the profile follows NiceMatrix and is registered", async () => {
    const first = await json(await create(body));
    expect(first.status).toBe(201);
    post = first.body.post;
    expect(first.body.post).toMatchObject({ shareId: body.shareId, status: "preparing", mediaState: "complete", syncMode: "follow", commentsMode: "open", sourceRevision: null });
    const again = await json(await create(body));
    expect([again.status, again.body.post.id]).toEqual([200, post.id]);
    expect((await json(await create({ ...body, userId: "other-user" }))).body.error.code).toBe("share.conflict");
    const profile = await ctx.db.selectFrom("profile").selectAll().where("user_id", "=", "nn-user").executeTakeFirstOrThrow();
    expect([profile.handle, profile.display_name]).toEqual(["nn.writer", "Nn Writer"]);
    expect(await ctx.db.selectFrom("outbox").select("kind").where("dedupe_key", "=", "user_registered:nn-user").executeTakeFirst()).toEqual({ kind: "user_registered" });
    const slug = post.url.split("/p/")[1];
    const preparing = await page(slug);
    expect(preparing.status).toBe(200);
    expect(preparing.html).toContain("Getting this post ready");
    expect(preparing.html).toContain('<meta name="robots" content="noindex">');
  });

  it("records the source app once, when the post is created; a missing or invalid one records nothing", async () => {
    const appOf = (id: string) => ctx.db.selectFrom("post").select(["source_app_key", "source_app_names"]).where("id", "=", id).executeTakeFirstOrThrow();
    const rec = share("app-user", { sourceApp: NICERECORDER_APP });
    const created = (await json(await create(rec))).body.post;
    expect(await appOf(created.id)).toEqual({ source_app_key: "nicerecorder", source_app_names: NICERECORDER_APP.names });
    expect((await json(await create({ ...rec, sourceApp: NICENOTE_APP }))).status).toBe(200);
    expect((await appOf(created.id)).source_app_key).toBe("nicerecorder");
    const cases = [{ sourceApp: undefined }, { sourceApp: null }, { sourceApp: { key: "Bad Key", names: { en: "X" } } }, { sourceApp: { key: "nicelist", names: { "zh-Hans": "x" } } }];
    for (const extra of cases) {
      const res = await json(await create(share("app-user", extra)));
      expect(res.status).toBe(201);
      expect(await appOf(res.body.post.id)).toEqual({ source_app_key: null, source_app_names: null });
    }
    // A new product group is registered (badge off); later names refresh the registry, settings are kept.
    await create(share("app-user", { sourceApp: { key: "nicenew", names: { en: "NiceNew" } } }));
    await create(share("app-user", { sourceApp: { key: "nicenew", names: { en: "NiceNew 2", "zh-Hans": "新" } } }));
    const reg = await ctx.db.selectFrom("source_app").selectAll().where("key", "=", "nicenew").executeTakeFirstOrThrow();
    expect([reg.names, reg.show_badge, reg.website_url]).toEqual([{ en: "NiceNew 2", "zh-Hans": "新" }, false, null]);
  });

  it("first push publishes; rich text renders structurally and safely; same content is a no-op; older revisions are refused", async () => {
    const content = doc(
      { type: "rich", lines: [
        { kind: "heading", level: 1, runs: [{ text: "Plan" }] },
        { kind: "paragraph", runs: [{ text: "<b>bold?</b> ", bold: false }, { text: "map", href: "https://maps.test/x" }, { text: " bad", href: "javascript:alert(1)" }] },
        { kind: "bullet", indent: 0, runs: [{ text: "water" }] },
        { kind: "bullet", indent: 2, runs: [{ text: "two litres", bold: true }] },
        { kind: "ordered", indent: 0, number: 3, runs: [{ text: "third" }] },
        { kind: "quote", runs: [{ text: "Go early" }] },
      ] },
      { type: "todo", items: [{ checked: true, runs: [{ text: "pack" }] }] },
      { type: "image", state: "pending" },
    );
    const first = await json(await push(post.id, { sourceRevision: 5, document: content }));
    expect(first.body).toMatchObject({ changed: true, post: { status: "active", sourceRevision: 5, mediaState: "complete" } });
    const { html, status } = await page(post.url.split("/p/")[1]);
    expect(status).toBe(200);
    expect(html).toContain("<h2>Plan</h2>");
    expect(html).toContain("&lt;b&gt;bold?&lt;/b&gt;");
    expect(html).toContain('<a href="https://maps.test/x" rel="nofollow noopener noreferrer ugc" target="_blank">map</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<ul><li>water<ul><li><strong>two litres</strong></li></ul></li></ul><ol start=\"3\"><li>third</li></ol>");
    expect(html).toContain("<blockquote><p>Go early</p></blockquote>");
    expect(html).toContain('class="ni-media-ph ni-media-ph-image" data-state="processing"');
    expect(html).toContain("From NiceNote");
    expect((await json(await push(post.id, { sourceRevision: 5, document: content }))).body.changed).toBe(false);
    const stale = await json(await push(post.id, { sourceRevision: 4, document: doc({ type: "text", text: "old" }) }));
    expect([stale.status, stale.body.error]).toEqual([409, { code: "post.stale_update", status: 409, details: { current: 5 } }]);
    expect((await json(await push(post.id, { sourceRevision: 5, document: doc({ type: "text", text: "same revision, new text" }) }))).body.changed).toBe(true);
  });

  it("uses stored media by ref, queues the others with their grant, refuses foreign grant URLs", async () => {
    await uploadAs(ctx, "nn-user", await jpegWithExif(), "ref-stored");
    const blocks = [
      { type: "image", state: "ready", ref: "ref-stored", mime: "image/jpeg", bytes: 10 },
      { type: "audio", state: "ready", ref: "ref-new", mime: "audio/mp4", bytes: 20 },
    ];
    const bad = await json(await push(post.id, { sourceRevision: 6, document: doc(...blocks), media: { "ref-new": { url: "https://evil.test/x" } } }));
    expect(bad.body.error).toMatchObject({ code: "media.grant_invalid" });
    const grant = { url: "https://api.test/v1/internal/niceideas/media/g1", expiresAt: "2026-12-01T00:00:00Z" };
    const ok = await json(await push(post.id, { sourceRevision: 6, document: doc(...blocks), media: { "ref-new": grant } }));
    expect(ok.body.post).toMatchObject({ mediaState: "processing" });
    const job = await ctx.db.selectFrom("media_job").selectAll().where("owner_id", "=", "nn-user").where("ref", "=", "ref-new").executeTakeFirstOrThrow();
    expect([job.state, job.kind, job.url]).toEqual(["pending", "audio", grant.url]);
    const { html } = await page(post.url.split("/p/")[1]);
    expect(html).toContain('<figure class="ni-image">');
    expect(html).toContain('class="ni-media-ph ni-media-ph-audio" data-state="processing"><span>Processing…</span>');
    const row = await ctx.db.selectFrom("post").select(["kind", "cover_media_id"]).where("id", "=", post.id).executeTakeFirstOrThrow();
    expect(row.kind).toBe("article");
    expect(row.cover_media_id).not.toBeNull();
  });

  it("settings, frozen, get, delete (idempotent, 410), no changes after delete", async () => {
    const patched = await json(await PATCH(signed("PATCH", `/posts/${post.id}`, { syncMode: "frozen", commentsMode: "closed" }), params({ id: post.id })));
    expect(patched.body.post).toMatchObject({ syncMode: "frozen", commentsMode: "closed" });
    expect((await json(await push(post.id, { sourceRevision: 7, document: doc({ type: "text", text: "x" }) }))).body.error.code).toBe("post.frozen");
    expect((await json(await GET(signed("GET", `/posts/${post.id}`), params({ id: post.id })))).body.post).toMatchObject({ id: post.id, visibility: "public" });
    // Visibility (v1.0.75): private = the author only; the backend made the change, so no event goes back.
    const slug = post.url.split("/p/")[1];
    const hidden = await json(await PATCH(signed("PATCH", `/posts/${post.id}`, { visibility: "private" }), params({ id: post.id })));
    expect(hidden.body.post).toMatchObject({ visibility: "private", syncMode: "frozen" });
    expect((await page(slug)).status).toBe(404);
    expect((await json(await PATCH(signed("PATCH", `/posts/${post.id}`, { visibility: "secret" }), params({ id: post.id })))).status).toBe(400);
    expect((await json(await PATCH(signed("PATCH", `/posts/${post.id}`, { visibility: "public" }), params({ id: post.id })))).body.post.visibility).toBe("public");
    expect((await page(slug)).status).toBe(200);
    expect(await ctx.db.selectFrom("outbox").select("id").where("kind", "=", "post_event").where("payload", "@>", JSON.stringify({ postId: post.id, event: "visibility_changed" }) as never).executeTakeFirst()).toBeUndefined();
    const web = await publishAs(ctx, "nn-user", { version: 1, blocks: [{ type: "text", text: "web post" }] });
    expect((await GET(signed("GET", `/posts/${web.id}`), params({ id: web.id }))).status).toBe(404);
    const del = await json(await DELETE(signed("DELETE", `/posts/${post.id}`), params({ id: post.id })));
    expect(del.body.post.status).toBe("unpublished");
    expect((await DELETE(signed("DELETE", `/posts/${post.id}`), params({ id: post.id }))).status).toBe(200);
    expect((await page(post.url.split("/p/")[1])).status).toBe(410);
    expect((await json(await PATCH(signed("PATCH", `/posts/${post.id}`, { syncMode: "follow" }), params({ id: post.id })))).body.error.code).toBe("post.unpublished");
  });

  it("preparing posts stay out of feeds; a takedown is reported to the backend", async () => {
    const p = (await json(await create(share("nn-user")))).body.post;
    const discover = await (await discoverRoute(new Request("http://localhost:3000/discover", { headers: { "accept-language": "en" } }))).text();
    expect(discover).not.toContain(p.url.split("/p/")[1]);
    await push(p.id, { sourceRevision: 1, document: doc({ type: "text", text: "live now" }) });
    await removePost({ db: ctx.db, stores: ctx.stores, cacheControl: "x", retentionDays: 30 }, { actorId: "ops", reason: "test" }, p.url.split("/p/")[1]);
    const events = await ctx.db.selectFrom("outbox").select("payload").where("kind", "=", "post_event").execute();
    expect(events.map((e) => e.payload)).toContainEqual(expect.objectContaining({ postId: p.id, shareId: p.shareId, event: "removed" }));
  });
});
