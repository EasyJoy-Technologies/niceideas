import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE as withdrawRoute } from "@/app/api/v1/posts/[id]/route";
import { GET as sourcesRoute } from "@/app/api/v1/me/sources/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { upsertApiClient } from "@/server/db/repos/api-clients";
import { resetSourceRegistryForTests } from "@/server/share/source-registry";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";

const API = "https://api.niceideas.app";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let sign: (claims: Record<string, unknown>) => Promise<string>;
beforeAll(async () => {
  ctx = await startAppContext();
  sign = (claims) => ctx.signRaw(claims);
  await upsertApiClient(ctx.db, { clientId: "omnifire-app", sourceKey: "omnifire", name: "OmniFire", homepageUrl: "https://omnifire.test", iconUrl: null });
  resetSourceRegistryForTests();
});
afterAll(async () => ctx?.stop());

const doc = { version: 1, blocks: [{ type: "text", text: "Posted from OmniFire" }] };
const body = (ref: string) => ({ document: doc, sourceRef: ref, sourceUpdatedAt: "2026-10-21T00:00:00Z" });
const create = (token: string, ref: string, key: string | null = `k-${ref}`) =>
  createRoute(jsonRequest("POST", "/api/v1/posts", token, body(ref), key ? { "idempotency-key": key } : {}), {});

describe("third-party publishing API", () => {
  it("publishes with a registered client and scope; post shows the client's badge", async () => {
    const token = await sign({ sub: "of-user", client_id: "omnifire-app", aud: API, scope: "posts:write media:write" });
    const res = await create(token, "o1");
    expect(res.status).toBe(201);
    const post = (await res.json()).post;
    expect(post.source).toBe("api:omnifire");
    const html = await (await pageRoute(new Request(`http://localhost:3000/p/${post.slug}`, { headers: { "accept-language": "en" } }), params({ slug: post.slug }))).text();
    expect(html).toContain("From OmniFire");
    expect(html).toContain("omnifire.test");
  });

  it("requires an Idempotency-Key, the scope and a registered active client", async () => {
    const ok = await sign({ sub: "of-user", client_id: "omnifire-app", aud: API, scope: "posts:write" });
    expect((await create(ok, "o2", null)).status).toBe(400);
    const noScope = await sign({ sub: "of-user", client_id: "omnifire-app", aud: API, scope: "posts:read" });
    expect(await (await create(noScope, "o3")).json()).toMatchObject({ error: { code: "auth.insufficient_scope" } });
    const unknown = await sign({ sub: "of-user", client_id: "someone", aud: API, scope: "posts:write" });
    expect((await create(unknown, "o4")).status).toBe(403);
  });

  it("cannot manage NiceNote posts or use first-party-only endpoints", async () => {
    const nn = await ctx.tokenFor("of-user");
    const nnPost = (await (await create(nn, "nn1", null)).json()).post;
    const third = await sign({ sub: "of-user", client_id: "omnifire-app", aud: API, scope: "posts:write posts:read" });
    const del = await withdrawRoute(jsonRequest("DELETE", `/api/v1/posts/${nnPost.id}`, third), params({ id: nnPost.id }));
    expect(del.status).toBe(404);
    const src = await sourcesRoute(jsonRequest("GET", "/api/v1/me/sources?source=nicenote", third), {});
    expect(src.status).toBe(403);
  });
});
