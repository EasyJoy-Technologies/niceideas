import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as issueRoute } from "@/app/api/internal/v1/nicenote/web-tickets/route";
import { POST as exchangeRoute } from "@/app/auth/app-ticket/route";
import { POST as signOutRoute } from "@/app/auth/sign-out/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { resetConfigForTests } from "@/server/config/env";
import { runMaintenance } from "@/server/maintenance/run-maintenance";
import { serviceHeaders } from "@/server/service-auth/signature";
import { params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { publishAs } from "../../helpers/publish";

const KEY = "t".repeat(40);
const SERVICE = "nicematrix-test";
const BASE = "http://localhost:3000";
const SOURCE = "/api/internal/v1/nicenote";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  Object.assign(process.env, { NICEMATRIX_SHARE_KEY: KEY, NICEMATRIX_SHARE_SERVICES: SERVICE });
  ctx = await startAppContext();
});
afterAll(async () => {
  for (const k of ["NICEMATRIX_SHARE_KEY", "NICEMATRIX_SHARE_SERVICES"]) delete process.env[k];
  resetConfigForTests();
  await ctx?.stop();
});

/** POST /web-tickets signed like the NiceMatrix backend signs it. */
async function issue(body: unknown, key = KEY) {
  const raw = JSON.stringify(body);
  const headers = { ...serviceHeaders(key, SERVICE, "POST", `${SOURCE}/web-tickets`, raw), "content-type": "application/json" };
  const res = await issueRoute(new Request(`${BASE}${SOURCE}/web-tickets`, { method: "POST", headers, body: raw }), {});
  return { status: res.status, body: await res.json() };
}
const ticketFor = async (userId: string) => (await issue({ userId, profile: null })).body.ticket as string;

/** The app's WebView loading the exchange URL with a form POST (no Origin, Sec-Fetch-Site: none). */
function exchange(form: Record<string, string> | string, headers: Record<string, string> = {}) {
  const body = typeof form === "string" ? form : new URLSearchParams(form).toString();
  return exchangeRoute(new Request(`${BASE}/auth/app-ticket`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "none", ...headers },
  }));
}
/** A web session cookie of a (new or existing) user. */
const webSession = async (userId: string) => {
  await ensureProfile(ctx.db, userId);
  return (await startSession(ctx.db, userId)).split(";")[0];
};
const setCookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]);
const sessionOf = (res: Response) => setCookies(res).find((c) => c.startsWith("ni_sid=") && c !== "ni_sid=");
const sessions = (userId: string) => ctx.db.selectFrom("web_session").select(["id_hash", "source"]).where("user_id", "=", userId).execute();
const ticketRows = (userId: string) => ctx.db.selectFrom("web_ticket").selectAll().where("user_id", "=", userId).execute();
const view = async (slug: string, cookie: string, headers: Record<string, string> = {}) => {
  const res = await pageRoute(new Request(`${BASE}/p/${slug}`, { headers: { cookie, "accept-language": "en", ...headers } }), params({ slug }));
  return { status: res.status, html: await res.text() };
};

describe("app sign-in ticket: issue (contract §10.2)", () => {
  it("creates and registers a new user from the sent profile; stores only the ticket's hash; 60 s", async () => {
    const before = Date.now();
    const r = await issue({ userId: "app-new", profile: { username: "App.Writer", name: "App Writer", avatarUrl: null } });
    expect(r.status).toBe(201);
    expect(r.body.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.body.exchangeUrl).toBe(`${BASE}/auth/app-ticket`);
    const ttl = Date.parse(r.body.expiresAt) - before;
    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThan(65_000);
    const profile = await ctx.db.selectFrom("profile").selectAll().where("user_id", "=", "app-new").executeTakeFirstOrThrow();
    expect([profile.handle, profile.display_name]).toEqual(["app.writer", "App Writer"]);
    expect(await ctx.db.selectFrom("outbox").select("kind").where("dedupe_key", "=", "user_registered:app-new").executeTakeFirst()).toEqual({ kind: "user_registered" });
    const rows = await ticketRows("app-new");
    expect(rows).toHaveLength(1);
    expect(rows[0].id_hash).not.toContain(r.body.ticket);
    expect(rows[0].used_at).toBeNull();
  });

  it("issues a new ticket per call; an existing profile follows the sent data", async () => {
    const a = await issue({ userId: "app-new", profile: { username: "App.Writer", name: "Renamed", avatarUrl: null } });
    const b = await issue({ userId: "app-new", profile: null });
    expect(a.body.ticket).not.toBe(b.body.ticket);
    expect((await ctx.db.selectFrom("profile").select("display_name").where("user_id", "=", "app-new").executeTakeFirstOrThrow()).display_name).toBe("Renamed");
  });

  it("refuses unsigned / badly signed calls, bad bodies and accounts being deleted", async () => {
    expect((await issue({ userId: "app-x", profile: null }, "x".repeat(40))).body.error.code).toBe("signature.invalid");
    expect((await issue({ profile: null })).body.error.code).toBe("request.invalid");
    await ctx.db.insertInto("profile").values({ user_id: "app-leaving", handle: "app_leaving", display_name: "", bio: "", status: "deleting" }).execute();
    expect(await issue({ userId: "app-leaving", profile: null })).toMatchObject({ status: 409, body: { error: { code: "user.deleting" } } });
    expect(await ticketRows("app-leaving")).toHaveLength(0);
  });
});

describe("app sign-in ticket: exchange (contract §10.3)", () => {
  it("signs the WebView in with an app session and lands on next (303, no-store); a ticket works once", async () => {
    const ticket = await ticketFor("app-a");
    const res = await exchange({ ticket, next: "/p/abcd2345efgh67?theme=dark" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/p/abcd2345efgh67?theme=dark");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(sessionOf(res)).toBeTruthy();
    expect(setCookies(res)).toContain("ni_sso=");
    expect((await sessions("app-a")).map((s) => s.source)).toEqual(["app"]);
    // Used up: the second exchange signs the browser out.
    const again = await exchange({ ticket, next: "/" }, { cookie: sessionOf(res)! });
    expect(setCookies(again)).toEqual(["ni_sid="]);
    expect(await sessions("app-a")).toHaveLength(0);
  });

  it("keeps a live session of the same user; replaces another user's session", async () => {
    const own = await webSession("app-b");
    const kept = await exchange({ ticket: await ticketFor("app-b"), next: "/" }, { cookie: own });
    expect(sessionOf(kept)).toBeUndefined();
    expect(await sessions("app-b")).toHaveLength(1);
    const switched = await exchange({ ticket: await ticketFor("app-c"), next: "/" }, { cookie: own });
    expect(sessionOf(switched)).toBeTruthy();
    expect(await sessions("app-b")).toHaveLength(0);
    expect(await sessions("app-c")).toHaveLength(1);
  });

  it("expired, unknown, malformed and deleted-account tickets end the current session", async () => {
    const expired = await ticketFor("app-d");
    await ctx.db.updateTable("web_ticket").set({ expires_at: new Date(Date.now() - 1000) }).where("user_id", "=", "app-d").execute();
    const leaving = await ticketFor("app-e");
    await ctx.db.updateTable("profile").set({ status: "deleting" }).where("user_id", "=", "app-e").execute();
    for (const form of [{ ticket: expired }, { ticket: leaving }, { ticket: "A".repeat(43) }, { ticket: "short" }, {}] as Record<string, string>[]) {
      const cookie = await webSession("app-f");
      const res = await exchange({ ...form, next: "/p/abcd2345efgh67" }, { cookie });
      expect([res.status, res.headers.get("location")]).toEqual([303, "/p/abcd2345efgh67"]);
      expect(setCookies(res)).toEqual(["ni_sid="]);
      expect(await sessions("app-f")).toHaveLength(0);
    }
    expect(await sessions("app-d")).toHaveLength(0);
    expect(await sessions("app-e")).toHaveLength(0);
  });

  it("refuses another site's submission without touching the session or the ticket", async () => {
    const cookie = await webSession("app-g");
    const ticket = await ticketFor("app-h");
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "none", origin: "https://evil.example" }] as Record<string, string>[]) {
      const res = await exchange({ ticket, next: "/p/abcd2345efgh67" }, { cookie, ...headers });
      expect([res.status, res.headers.get("location")]).toEqual([303, "/p/abcd2345efgh67"]);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    expect(await sessions("app-g")).toHaveLength(1);
    expect((await ticketRows("app-h"))[0].used_at).toBeNull();
    // Origin "null" (opaque) from the app itself is accepted.
    expect(sessionOf(await exchange({ ticket, next: "/" }, { origin: "null" }))).toBeTruthy();
  });

  it("only same-site paths outside /auth/ are targets; non-ASCII is percent-encoded", async () => {
    const cases: [string | undefined, string][] = [
      ["//evil.example", "/"], ["https://evil.example/x", "/"], ["/\t/evil.example", "/"], ["/auth/callback", "/"], [undefined, "/"],
      ["/search?q=中文", "/search?q=%E4%B8%AD%E6%96%87"],
    ];
    for (const [next, location] of cases) {
      const res = await exchange({ ticket: await ticketFor("app-i"), ...(next === undefined ? {} : { next }) });
      expect(res.headers.get("location")).toBe(location);
      expect(sessionOf(res)).toBeTruthy();
    }
  });

  it("reads a body without Content-Type as a form; other types and oversized bodies are no ticket", async () => {
    // Android WebView posts may carry no Content-Type at all (a byte body gets none in fetch's Request).
    const bare = new Request(`${BASE}/auth/app-ticket`, { method: "POST", body: new TextEncoder().encode(new URLSearchParams({ ticket: await ticketFor("app-j"), next: "/" }).toString()) });
    expect(bare.headers.get("content-type")).toBeNull();
    expect(sessionOf(await exchangeRoute(bare))).toBeTruthy();
    const json = await exchange(JSON.stringify({ ticket: await ticketFor("app-k") }), { "content-type": "application/json" });
    expect(setCookies(json)).toEqual(["ni_sid="]);
    const big = await exchange(`ticket=${await ticketFor("app-k")}&pad=${"x".repeat(5000)}`);
    expect(setCookies(big)).toEqual(["ni_sid="]);
    expect(await sessions("app-k")).toHaveLength(0);
  });

  it("concurrent exchanges of one ticket: exactly one signs in", async () => {
    const ticket = await ticketFor("app-l");
    const results = await Promise.all(Array.from({ length: 5 }, () => exchange({ ticket, next: "/" })));
    expect(results.filter((r) => sessionOf(r)).length).toBe(1);
    expect(await sessions("app-l")).toHaveLength(1);
  });
});

describe("app sign-in ticket: sessions in use (contract §10.4) and mainland China", () => {
  it("works from mainland China: the author sees their private post, without account controls or the edit link", async () => {
    const post = await publishAs(ctx, "app-cn", { version: 1, blocks: [{ type: "text", text: "Private from China" }] });
    await ctx.db.updateTable("post").set({ visibility: "private" }).where("id", "=", post.id).execute();
    const res = await exchange({ ticket: await ticketFor("app-cn"), next: `/p/${post.slug}` }, { "cf-ipcountry": "CN" });
    const cookie = sessionOf(res)!;
    expect(cookie).toBeTruthy();
    const cn = await view(post.slug, cookie, { "cf-ipcountry": "CN" });
    expect(cn.status).toBe(200);
    expect(cn.html).toContain("Private from China");
    expect(cn.html).toContain("Only you can see this post");
    expect(cn.html).toContain('action="/api/web/posts/visibility"');
    expect(cn.html).not.toContain(`/p/${post.slug}/edit`);
    expect(cn.html).not.toContain("/auth/sign-out");
    expect(cn.html).not.toContain('href="/notifications"');
    expect((await view(post.slug, "", { "cf-ipcountry": "CN" })).status).toBe(404);
    // Elsewhere the same session gets the full menu.
    const intl = await view(post.slug, cookie);
    expect(intl.html).toContain(`/p/${post.slug}/edit`);
    expect(intl.html).toContain("/auth/sign-out");
  });

  it("signing out of an app session only ends it (no NiceMatrix sign-out), and marks silent sign-in as done", async () => {
    const cookie = sessionOf(await exchange({ ticket: await ticketFor("app-m"), next: "/" }))!;
    const out = await signOutRoute(new Request(`${BASE}/auth/sign-out`, { method: "POST", headers: { cookie, origin: BASE } }));
    expect([out.status, out.headers.get("location")]).toEqual([303, "/"]);
    expect(setCookies(out)).toEqual(["ni_sid=", "ni_sso=1"]);
    expect(await sessions("app-m")).toHaveLength(0);
  });

  it("daily maintenance removes expired tickets; account deletion removes them with the profile", async () => {
    await ticketFor("app-n");
    await ctx.db.updateTable("web_ticket").set({ expires_at: new Date(Date.now() - 1000) }).execute();
    const live = await ticketFor("app-n");
    const report = await runMaintenance(ctx.db, ctx.stores);
    expect(report.ticketsExpired).toBeGreaterThan(0);
    expect(await ticketRows("app-n")).toHaveLength(1);
    await ctx.db.deleteFrom("profile").where("user_id", "=", "app-n").execute();
    expect(await ticketRows("app-n")).toHaveLength(0);
    expect(setCookies(await exchange({ ticket: live, next: "/" }))).toEqual(["ni_sid="]);
  });
});
