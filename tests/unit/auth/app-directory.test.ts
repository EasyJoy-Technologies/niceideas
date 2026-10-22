import { afterEach, describe, expect, it, vi } from "vitest";
import { appDirectory } from "@/server/auth/app-directory";
import { resetConfigForTests } from "@/server/config/env";

process.env.DATABASE_URL ??= "postgres://unused@localhost/unused";
resetConfigForTests();

const reply = (status: number, body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
afterEach(() => vi.restoreAllMocks());

describe("app directory client", () => {
  it("parses the platform envelope, maps only oauth_app.not_found to unknown, everything else to an outage", async () => {
    const data = { clientId: "c1", name: " One ", logoUrl: "javascript:x", websiteUrl: "https://one.test", privacyUrl: "https://one.test/p", termsUrl: "https://one.test/t", status: "active" };
    reply(200, { ok: true, data });
    expect(await appDirectory()("c1")).toEqual({ clientId: "c1", name: "One", logoUrl: null, websiteUrl: "https://one.test", status: "active" });
    reply(404, { ok: false, error: { code: "BIZ_404", message_key: "oauth_app.not_found" } });
    expect(await appDirectory()("c1")).toBeNull();
    reply(404, { ok: false, error: { code: "BIZ_404", message_key: "route.not_found" } });
    await expect(appDirectory()("c1")).rejects.toThrow("404 route.not_found");
    reply(404, "<html>");
    await expect(appDirectory()("c1")).rejects.toThrow("404 unknown");
    reply(200, data);
    await expect(appDirectory()("c1")).rejects.toThrow("malformed");
    reply(200, { ok: true, data: { ...data, clientId: "other" } });
    await expect(appDirectory()("c1")).rejects.toThrow("malformed");
    reply(503, { ok: false });
    await expect(appDirectory()("c1")).rejects.toThrow("503");
  });
});
