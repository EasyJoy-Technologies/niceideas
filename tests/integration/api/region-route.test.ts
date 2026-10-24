import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as meRoute } from "@/app/api/v1/me/route";
import { GET as metaRoute } from "@/app/api/v1/meta/route";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { resetConfigForTests } from "@/server/config/env";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest } from "../../helpers/api";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => (ctx = await startAppContext()));
afterAll(async () => ctx?.stop());

const CN = { "cf-ipcountry": "CN" };

describe("region policy on APIs", () => {
  it("mainland China: publishing + meta allowed, other APIs 451", async () => {
    const token = await ctx.apiToken("cn-user");
    const body = { document: { version: 1, blocks: [{ type: "text", text: "hi" }] }, sourceRef: "n1", sourceUpdatedAt: "2026-10-19T00:00:00Z" };
    expect((await createRoute(jsonRequest("POST", "/api/v1/posts", token, body, { ...CN, "idempotency-key": "n1" }), {})).status).toBe(201);
    expect((await metaRoute(jsonRequest("GET", "/api/v1/meta", null, undefined, CN), {})).status).toBe(200);
    const me = await meRoute(jsonRequest("GET", "/api/v1/me", token, undefined, CN), {});
    expect(await me.json()).toEqual({ error: { code: "region.restricted", status: 451 } });
    expect((await meRoute(jsonRequest("GET", "/api/v1/me", token, undefined, { "cf-ipcountry": "HK" }), {})).status).toBe(200);
  });

  it("REGION_POLICY_CN=off lifts the restriction", async () => {
    process.env.REGION_POLICY_CN = "off";
    resetConfigForTests();
    const token = await ctx.apiToken("cn-user");
    expect((await meRoute(jsonRequest("GET", "/api/v1/me", token, undefined, CN), {})).status).toBe(200);
    delete process.env.REGION_POLICY_CN;
    resetConfigForTests();
  });
});
