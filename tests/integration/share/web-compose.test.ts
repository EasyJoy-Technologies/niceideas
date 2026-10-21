import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as composeRoute } from "@/app/api/web/compose/route";
import { GET as homeRoute } from "@/app/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif, svg } from "../../helpers/media-fixtures";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let cookie: string;
beforeAll(async () => {
  ctx = await startAppContext();
  await ensureProfile(ctx.db, "web-writer");
  cookie = (await startSession(ctx.db, "web-writer")).split(";")[0];
});
afterAll(async () => ctx?.stop());

function post(fields: Record<string, string>, files: { name: string; data: Buffer; type: string }[] = [], headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append("images", new File([new Uint8Array(f.data)], f.name, { type: f.type }));
  return composeRoute(new Request(`${BASE}/api/web/compose`, { method: "POST", body: form, headers: { origin: BASE, cookie, ...headers } }));
}

describe("web compose", () => {
  it("shows the compose box on the signed-in home only", async () => {
    const html = await (await homeRoute(new Request(`${BASE}/`, { headers: { "accept-language": "en", cookie: `${cookie}; ni_sso=1` } }))).text();
    expect(html).toContain('action="/api/web/compose"');
    const anon = await (await homeRoute(new Request(`${BASE}/`, { headers: { "accept-language": "en", cookie: "ni_sso=1" } }))).text();
    expect(anon).not.toContain('action="/api/web/compose"');
  });

  it("publishes a short web post without a source badge", async () => {
    const res = await post({ title: "", text: "Hello from the web" });
    expect(res.status).toBe(303);
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.source).toBe("web");
    expect(row.kind).toBe("short");
  });

  it("publishes an article with a title and an image", async () => {
    const res = await post({ title: "Web article", text: "Body" }, [{ name: "a.jpg", data: await jpegWithExif(), type: "image/jpeg" }]);
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.kind).toBe("article");
    expect(row.title).toBe("Web article");
    expect(row.cover_media_id).not.toBeNull();
  });

  it("rejects empty posts, non-images, other origins and signed-out visitors", async () => {
    expect((await post({ title: "", text: "  " })).headers.get("location")).toBe("/?compose=empty");
    expect((await post({ text: "x" }, [{ name: "x.svg", data: svg(), type: "image/svg+xml" }])).headers.get("location")).toBe("/?compose=unsupported");
    expect((await post({ text: "x" }, [], { origin: "https://evil.test" })).status).toBe(403);
    expect((await post({ text: "x" }, [], { cookie: "" })).headers.get("location")).toBe("/auth/sign-in?next=%2F");
    expect((await post({ text: "x" }, [], { "cf-ipcountry": "CN" })).status).toBe(451);
  });
});
