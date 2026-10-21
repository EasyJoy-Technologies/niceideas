import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE as withdrawRoute } from "@/app/api/v1/posts/[id]/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { resetConfigForTests } from "@/server/config/env";
import { verifyProof } from "@/server/interactions/pow";
import { getDb } from "@/server/db";
import { clearPageCacheForTests } from "@/server/share/page-cache";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  ctx = await startAppContext();
  process.env.PAGE_CACHE_SECONDS = "60";
  process.env.COMMENT_POW_BITS = "0";
  resetConfigForTests();
  clearPageCacheForTests();
});
afterAll(async () => {
  delete process.env.COMMENT_POW_BITS;
  process.env.PAGE_CACHE_SECONDS = "0";
  resetConfigForTests();
  await ctx?.stop();
});

const doc = (text: string) => ({ version: 1, blocks: [{ type: "text", text }] });
const view = (slug: string, cookie = "", lang = "en") =>
  pageRoute(new Request(`http://localhost:3000/p/${slug}`, { headers: { cookie, "accept-language": lang } }), params({ slug }));

describe("anonymous page cache", () => {
  it("serves anonymous visitors from the cache; cookies bypass it; languages are separate", async () => {
    const token = await ctx.tokenFor("cache-user");
    const res = await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document: doc("Cached words"), sourceRef: "c1", sourceUpdatedAt: "2026-10-21T00:00:00Z" }), {});
    const post = (await res.json()).post;
    expect((await view(post.slug)).status).toBe(200);
    const de = await (await view(post.slug, "", "de")).text();
    expect(de).toContain('lang="de"');
    await withdrawRoute(jsonRequest("DELETE", `/api/v1/posts/${post.id}`, token), params({ id: post.id }));
    // Within the cache window anonymous visitors still get the cached page; anyone with a cookie sees the change.
    expect((await view(post.slug)).status).toBe(200);
    expect((await view(post.slug, "ni_vid=abcdefghijklmnopqrstuv")).status).toBe(410);
    clearPageCacheForTests();
    expect((await view(post.slug)).status).toBe(410);
  });
});

describe("proof of work", () => {
  it("is single-use across processes (spent challenges live in the database)", async () => {
    const { issueChallenge } = await import("@/server/interactions/pow");
    const { challenge } = issueChallenge();
    expect(await verifyProof(getDb(), challenge, "0")).toBe(true);
    expect(await verifyProof(getDb(), challenge, "0")).toBe(false);
  });
});
