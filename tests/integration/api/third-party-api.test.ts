import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE as withdrawRoute, GET as getRoute } from "@/app/api/v1/posts/[id]/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { setAppDirectoryForTests, type DirectoryApp } from "@/server/auth/app-directory";
import { clearAppDirectoryCacheForTests } from "@/server/auth/third-party";
import { setApiClientStatus } from "@/server/db/repos/api-clients";
import { resetSourceRegistryForTests } from "@/server/share/source-registry";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";
import { shareFromNiceNote } from "../../helpers/publish";

const API = "https://api.niceideas.app";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
// Contract test double of GET /v1/oauth/apps/{clientId}.
const directory = new Map<string, DirectoryApp>();
let directoryDown = false;
let directoryCalls = 0;
beforeAll(async () => {
  ctx = await startAppContext();
  setAppDirectoryForTests(async (id) => {
    directoryCalls++;
    if (directoryDown) throw new Error("unreachable");
    return directory.get(id) ?? null;
  });
});
afterAll(async () => {
  setAppDirectoryForTests(null);
  await ctx?.stop();
});
beforeEach(() => {
  clearAppDirectoryCacheForTests();
  resetSourceRegistryForTests();
  directoryDown = false;
  directory.set("app-one", { clientId: "app-one", name: "App One", logoUrl: "https://one.test/logo.png", websiteUrl: "https://one.test", status: "active" });
});

const doc = { version: 1, blocks: [{ type: "text", text: "Posted from an third-party app" }] };
const body = (ref: string) => ({ document: doc, sourceRef: ref, sourceUpdatedAt: "2026-10-21T00:00:00Z" });
const token = (clientId: string, scope: string, sub = "tp-user") => ctx.signRaw({ sub, client_id: clientId, aud: API, scope });
const create = async (tok: string, ref: string, key: string | null = `k-${ref}`) =>
  createRoute(jsonRequest("POST", "/api/v1/posts", tok, body(ref), key ? { "idempotency-key": key } : {}), {});
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;

describe("third-party API (app directory)", () => {
  it("publishes for a directory app; the badge uses directory name, logo and website", async () => {
    const res = await create(await token("app-one", "posts:write"), "a1");
    expect(res.status).toBe(201);
    const post = (await res.json()).post;
    expect(post.source).toBe("api:app-one");
    const html = await (await pageRoute(new Request(`http://localhost:3000/p/${post.slug}`, { headers: { "accept-language": "en" } }), params({ slug: post.slug }))).text();
    expect(html).toContain("From App One");
    expect(html).toContain("https://one.test/logo.png");
    expect(html).toContain("one.test/?utm_source=niceideas");
    const row = await ctx.db.selectFrom("api_client").selectAll().where("client_id", "=", "app-one").executeTakeFirstOrThrow();
    expect([row.name, row.dir_status, row.status]).toEqual(["App One", "active", "active"]);
  });

  it("unknown → client_unknown, suspended → client_suspended, locally blocked → client_blocked", async () => {
    const unknown = await create(await token("nobody", "posts:write"), "u1");
    expect([unknown.status, await code(unknown)]).toEqual([403, "auth.client_unknown"]);
    directory.set("app-two", { clientId: "app-two", name: "Two", logoUrl: null, websiteUrl: null, status: "suspended" });
    const suspended = await create(await token("app-two", "posts:write"), "s1");
    expect([suspended.status, await code(suspended)]).toEqual([403, "auth.client_suspended"]);
    await setApiClientStatus(ctx.db, "app-one", "disabled", "spam");
    const blocked = await create(await token("app-one", "posts:write"), "b1");
    expect([blocked.status, await code(blocked)]).toEqual([403, "auth.client_blocked"]);
    await setApiClientStatus(ctx.db, "app-one", "active");
  });

  it("checks each endpoint's scope; a partial grant works for the granted part only", async () => {
    const readOnly = await token("app-one", "posts:read");
    const denied = await create(readOnly, "p1");
    expect([denied.status, await code(denied)]).toEqual([403, "auth.insufficient_scope"]);
    const writer = await token("app-one", "posts:write");
    const post = (await (await create(writer, "p2")).json()).post;
    const read = await getRoute(jsonRequest("GET", `/api/v1/posts/${post.id}`, writer), params({ id: post.id }));
    expect(await code(read)).toBe("auth.insufficient_scope");
    expect((await getRoute(jsonRequest("GET", `/api/v1/posts/${post.id}`, readOnly), params({ id: post.id }))).status).toBe(200);
    expect((await create(await token("app-one", ""), "p3")).status).toBe(403);
  });

  it("requires Idempotency-Key; cannot touch NiceNote shares; NiceNote client tokens are refused", async () => {
    const writer = await token("app-one", "posts:write posts:read");
    expect((await create(writer, "i1", null)).status).toBe(400);
    const nnPost = await shareFromNiceNote(ctx, "tp-user", { version: 1, blocks: [{ type: "text", text: "From NiceNote" }] });
    expect((await withdrawRoute(jsonRequest("DELETE", `/api/v1/posts/${nnPost.id}`, writer), params({ id: nnPost.id }))).status).toBe(404);
    const legacy = await create(await ctx.legacyToken("tp-user"), "nn2", null);
    expect([legacy.status, await code(legacy)]).toEqual([401, "auth.audience_not_accepted"]);
  });

  it("caches directory answers and survives a directory outage with the last known entry", async () => {
    const tok = await token("app-one", "posts:write", "cache-user");
    await create(tok, "c1");
    const calls = directoryCalls;
    await create(tok, "c2");
    expect(directoryCalls).toBe(calls);
    clearAppDirectoryCacheForTests();
    directoryDown = true;
    expect((await create(tok, "c3")).status).toBe(201);
    const never = await create(await token("never-seen", "posts:write"), "c4");
    expect([never.status, await code(never)]).toEqual([503, "auth.directory_unavailable"]);
  });
});
