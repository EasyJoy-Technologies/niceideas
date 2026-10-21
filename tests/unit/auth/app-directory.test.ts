import { afterEach, describe, expect, it, vi } from "vitest";
import { appDirectory } from "@/server/auth/app-directory";
import { resetConfigForTests } from "@/server/config/env";

process.env.DATABASE_URL ??= "postgres://unused@localhost/unused";
resetConfigForTests();

const reply = (status: number, body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
afterEach(() => vi.restoreAllMocks());

describe("app directory client", () => {
  it("parses an entry, maps unknown apps to null and a missing route to an outage", async () => {
    reply(200, { clientId: "c1", name: " One ", logoUrl: "javascript:x", websiteUrl: "https://one.test", status: "active" });
    expect(await appDirectory()("c1")).toEqual({ clientId: "c1", name: "One", logoUrl: null, websiteUrl: "https://one.test", status: "active" });
    reply(404, { error: { message_key: "oauth.app_not_found" } });
    expect(await appDirectory()("c1")).toBeNull();
    reply(404, { ok: false, error: { code: "BIZ_404", message_key: "route.not_found" } });
    await expect(appDirectory()("c1")).rejects.toThrow("route not found");
    reply(200, { clientId: "other", name: "X", status: "active" });
    await expect(appDirectory()("c1")).rejects.toThrow("malformed");
  });
});
