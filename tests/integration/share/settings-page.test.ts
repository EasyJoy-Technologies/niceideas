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

  it("saves name and bio; the handle (NiceMatrix username) is read-only", async () => {
    const before = await ctx.db.selectFrom("profile").select("handle").where("user_id", "=", "settings-user").executeTakeFirstOrThrow();
    expect(await loc(save({ displayName: "  New  Name ", handle: "new_handle", bio: "Hi\n\n\n\nthere" }))).toBe("/settings?n=saved");
    const p = await ctx.db.selectFrom("profile").selectAll().where("user_id", "=", "settings-user").executeTakeFirstOrThrow();
    expect([p.display_name, p.handle, p.bio]).toEqual(["New Name", before.handle, "Hi\n\nthere"]);
    const html = await (await settingsGet(new Request(`${BASE}/settings?n=saved`, { headers: { "accept-language": "en", cookie } }))).text();
    expect(html).toContain(`value="${before.handle}" readonly`);
    expect(html).not.toContain('name="handle"');
    expect(html).toContain("Saved.");
  });

  it("rejects long values and other origins", async () => {
    expect(await loc(save({ displayName: "x".repeat(51), bio: "" }))).toBe("/settings?n=too_long");
    expect((await save({ displayName: "x", bio: "" }, { origin: "https://evil.test" })).status).toBe(403);
  });
});
