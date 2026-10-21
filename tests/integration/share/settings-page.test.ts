import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as settingsGet, POST as settingsPost } from "@/app/settings/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let cookie: string;
beforeAll(async () => {
  ctx = await startAppContext();
  await ensureProfile(ctx.db, "settings-user");
  await ensureProfile(ctx.db, "other-user");
  await ctx.db.updateTable("profile").set({ handle: "taken_one" }).where("user_id", "=", "other-user").execute();
  cookie = (await startSession(ctx.db, "settings-user")).split(";")[0];
});
afterAll(async () => ctx?.stop());

const save = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  settingsPost(new Request(`${BASE}/settings`, { method: "POST", body: new URLSearchParams(fields), headers: { origin: BASE, cookie, "content-type": "application/x-www-form-urlencoded", ...headers } }));
const loc = async (r: Promise<Response>) => (await r).headers.get("location");

describe("settings", () => {
  it("requires sign-in", async () => {
    const res = await settingsGet(new Request(`${BASE}/settings`, { headers: { "accept-language": "en" } }));
    expect(res.headers.get("location")).toBe("/auth/sign-in?next=%2Fsettings");
  });

  it("saves name, handle and bio", async () => {
    expect(await loc(save({ displayName: "  New  Name ", handle: "@New_Handle", bio: "Hi\n\n\n\nthere" }))).toBe("/settings?n=saved");
    const p = await ctx.db.selectFrom("profile").selectAll().where("user_id", "=", "settings-user").executeTakeFirstOrThrow();
    expect([p.display_name, p.handle, p.bio]).toEqual(["New Name", "new_handle", "Hi\n\nthere"]);
    const html = await (await settingsGet(new Request(`${BASE}/settings?n=saved`, { headers: { "accept-language": "en", cookie } }))).text();
    expect(html).toContain('value="new_handle"');
    expect(html).toContain("Saved.");
  });

  it("rejects bad, reserved and taken handles, long values and other origins", async () => {
    expect(await loc(save({ displayName: "x", handle: "ab", bio: "" }))).toBe("/settings?n=handle_invalid");
    expect(await loc(save({ displayName: "x", handle: "admin", bio: "" }))).toBe("/settings?n=handle_invalid");
    expect(await loc(save({ displayName: "x", handle: "taken_one", bio: "" }))).toBe("/settings?n=handle_taken");
    expect(await loc(save({ displayName: "x".repeat(51), handle: "new_handle", bio: "" }))).toBe("/settings?n=too_long");
    expect((await save({ displayName: "x", handle: "new_handle", bio: "" }, { origin: "https://evil.test" })).status).toBe(403);
  });
});
