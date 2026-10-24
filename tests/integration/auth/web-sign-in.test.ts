import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as callbackRoute } from "@/app/auth/callback/route";
import { GET as signInRoute } from "@/app/auth/sign-in/route";
import { POST as signOutRoute } from "@/app/auth/sign-out/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { setOidcProviderForTests } from "@/server/auth/web/oidc-provider";
import { resetConfigForTests } from "@/server/config/env";
import { startAppContext } from "../../helpers/app-context";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
let lastAuthorize: { state: string; nonce: string; silent: boolean } | null = null;
let claims: Record<string, unknown> = {};
beforeAll(async () => {
  process.env.LOGTO_WEB_APP_ID = "web-app";
  process.env.LOGTO_WEB_APP_SECRET = "w".repeat(32);
  process.env.WEB_SILENT_SSO = "on";
  ctx = await startAppContext();
  setOidcProviderForTests({
    async authorizeUrl(p) {
      lastAuthorize = p;
      return `https://id.test/oidc/auth?state=${p.state}${p.silent ? "&prompt=none" : ""}`;
    },
    async redeem(code, _verifier, nonce) {
      if (code !== "good") throw new Error("bad code");
      return { sub: "web-user", nonce, ...claims };
    },
    async endSessionUrl() {
      return "https://id.test/oidc/session/end";
    },
  });
});
afterAll(async () => {
  setOidcProviderForTests(null);
  for (const k of ["LOGTO_WEB_APP_ID", "LOGTO_WEB_APP_SECRET", "WEB_SILENT_SSO"]) delete process.env[k];
  resetConfigForTests();
  await ctx?.stop();
});

const BASE = "http://localhost:3000";
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));
const html = { accept: "text/html", "accept-language": "en" };

async function signIn(next = "/discover", code = "good") {
  const start = await signInRoute(new Request(`${BASE}/auth/sign-in?next=${encodeURIComponent(next)}`));
  expect(start.status).toBe(303);
  const flow = cookiesOf(start).join("; ");
  const cb = await callbackRoute(new Request(`${BASE}/auth/callback?code=${code}&state=${lastAuthorize!.state}`, { headers: { cookie: flow } }));
  return cb;
}

describe("web sign-in", () => {
  it("signs in, fills the profile from the ID token and shows the account menu", async () => {
    claims = { name: "Web User", picture: "https://cdn.test/a.png" };
    const cb = await signIn("/discover?tab=articles");
    expect(cb.status).toBe(303);
    expect(cb.headers.get("location")).toBe("/discover?tab=articles");
    const session = cookiesOf(cb).find((c) => c.startsWith("ni_sid="))!;
    expect(session).toBeTruthy();
    const p = await ctx.db.selectFrom("profile").selectAll().where("user_id", "=", "web-user").executeTakeFirstOrThrow();
    expect(p.display_name).toBe("Web User");
    // The avatar is downloaded into our bucket by the worker (tests/integration/worker/avatars.test.ts).
    expect(p.avatar_source).toBe("https://cdn.test/a.png");
    expect((await ctx.db.selectFrom("avatar_job").select("source_url").where("user_id", "=", "web-user").executeTakeFirstOrThrow()).source_url).toBe("https://cdn.test/a.png");
    const page = await (await discoverRoute(new Request(`${BASE}/discover`, { headers: { ...html, cookie: session } }))).text();
    expect(page).toContain("ni-acct-rail");
    expect(page).toContain('action="/auth/sign-out"');
  });

  it("takes the handle from the NiceMatrix username at every sign-in; unusable or taken usernames keep the current one", async () => {
    const handle = async () => (await ctx.db.selectFrom("profile").select("handle").where("user_id", "=", "web-user").executeTakeFirstOrThrow()).handle;
    claims = { username: "Xiang_Lin" };
    await signIn();
    expect(await handle()).toBe("xiang_lin");
    claims = { username: "admin" };
    await signIn();
    expect(await handle()).toBe("xiang_lin");
    await ctx.db.insertInto("profile").values({ user_id: "holder", handle: "taken_name", display_name: "", bio: "" }).execute();
    claims = { username: "taken_name" };
    expect((await signIn()).status).toBe(303);
    expect(await handle()).toBe("xiang_lin");
    claims = { username: "renamed_1" };
    await signIn();
    expect(await handle()).toBe("renamed_1");
    claims = { username: "XK" };
    await signIn();
    expect(await handle()).toBe("xk");
    claims = { username: "a".repeat(65) };
    await signIn();
    expect(await handle()).toBe("xk");
    claims = { username: "Xiang.Lin" };
    await signIn();
    expect(await handle()).toBe("xiang.lin");
    claims = { username: ".." };
    await signIn();
    expect(await handle()).toBe("xiang.lin");
  });

  it("rejects a callback without the matching flow cookie or with a bad code", async () => {
    await signInRoute(new Request(`${BASE}/auth/sign-in`));
    expect((await callbackRoute(new Request(`${BASE}/auth/callback?code=good&state=${lastAuthorize!.state}`))).status).toBe(400);
    expect((await signIn("/", "bad")).status).toBe(502);
  });

  it("only returns to same-site paths", async () => {
    expect((await signIn("https://evil.test/")).headers.get("location")).toBe("/");
    expect((await signIn("//evil.test/")).headers.get("location")).toBe("/");
  });

  it("signs out (same-origin form only) and ends the NiceMatrix session", async () => {
    const session = cookiesOf(await signIn()).find((c) => c.startsWith("ni_sid="))!;
    expect((await signOutRoute(new Request(`${BASE}/auth/sign-out`, { method: "POST", headers: { cookie: session } }))).status).toBe(403);
    const out = await signOutRoute(new Request(`${BASE}/auth/sign-out`, { method: "POST", headers: { cookie: session, origin: BASE } }));
    expect(out.headers.get("location")).toBe("https://id.test/oidc/session/end");
    const page = await (await discoverRoute(new Request(`${BASE}/discover`, { headers: { ...html, cookie: `${session}; ni_sso=1` } }))).text();
    expect(page).not.toContain("ni-acct-rail");
    expect(page).toContain("/auth/sign-in?next=");
  });

  it("tries silent SSO once for signed-out browsers, never for bots", async () => {
    const first = await discoverRoute(new Request(`${BASE}/discover`, { headers: html }));
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("/auth/sign-in?silent=1&next=%2Fdiscover");
    const bot = await discoverRoute(new Request(`${BASE}/discover`, { headers: { ...html, "user-agent": "Googlebot/2.1" } }));
    expect(bot.status).toBe(200);
    // login_required → back to the page, remembered for a day.
    const start = await signInRoute(new Request(`${BASE}/auth/sign-in?silent=1&next=%2Fdiscover`));
    expect(lastAuthorize!.silent).toBe(true);
    const cb = await callbackRoute(new Request(`${BASE}/auth/callback?error=login_required&state=${lastAuthorize!.state}`, { headers: { cookie: cookiesOf(start).join("; ") } }));
    expect(cb.headers.get("location")).toBe("/discover");
    expect(cookiesOf(cb)).toContain("ni_sso=1");
  });

  it("drops sessions when account deletion is requested", async () => {
    const session = cookiesOf(await signIn()).find((c) => c.startsWith("ni_sid="))!;
    await ctx.db.updateTable("profile").set({ status: "deleting" }).where("user_id", "=", "web-user").execute();
    const page = await (await discoverRoute(new Request(`${BASE}/discover`, { headers: { ...html, cookie: `${session}; ni_sso=1` } }))).text();
    expect(page).not.toContain("ni-acct-rail");
    expect((await signIn()).status).toBe(403);
  });
});
