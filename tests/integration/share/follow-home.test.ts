import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishAs } from "../../helpers/publish";
import { POST as followRoute } from "@/app/follow/route";
import { GET as homeRoute } from "@/app/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let cookie: string;
let authorHandle: string;
beforeAll(async () => {
  ctx = await startAppContext();
  await publishAs(ctx, "followed-author", { version: 1, blocks: [{ type: "text", text: "Followed author idea" }] }, "f1");
  authorHandle = (await ensureProfile(ctx.db, "followed-author")).handle;
  await ensureProfile(ctx.db, "reader");
  cookie = (await startSession(ctx.db, "reader")).split(";")[0];
});
afterAll(async () => ctx?.stop());

const home = async (c: string | null) => (await homeRoute(new Request(`${BASE}/`, { headers: { "accept-language": "en", ...(c ? { cookie: `${c}; ni_sso=1` } : { cookie: "ni_sso=1" }) } }))).text();
const follow = (on: boolean, c: string | null, origin = BASE) => {
  const body = new URLSearchParams({ handle: authorHandle, on: on ? "1" : "0", next: `/@${authorHandle}` });
  return followRoute(new Request(`${BASE}/follow`, { method: "POST", body, headers: { origin, "content-type": "application/x-www-form-urlencoded", ...(c ? { cookie: c } : {}) } }));
};

describe("follow and home timeline", () => {
  it("signed-out home is Discover; follow asks to sign in", async () => {
    expect(await home(null)).toContain("Followed author idea");
    const res = await follow(true, null);
    expect(res.headers.get("location")).toBe(`/auth/sign-in?next=${encodeURIComponent(`/@${authorHandle}`)}`);
  });

  it("home shows only followed authors and own posts; suggestions exclude followed authors", async () => {
    const before = await home(cookie);
    expect(before).toContain("Follow some authors");
    expect(before).toContain("Authors to follow");
    expect((await follow(true, cookie, "https://evil.test")).status).toBe(403);
    expect((await follow(true, cookie)).status).toBe(303);
    const after = await home(cookie);
    expect(after).toContain("Followed author idea");
    expect(after).not.toContain("Authors to follow");
    await follow(false, cookie);
    expect(await home(cookie)).toContain("Follow some authors");
  });
});
