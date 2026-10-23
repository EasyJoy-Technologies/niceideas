import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as composeRoute } from "@/app/api/web/compose/route";
import { GET as homeRoute } from "@/app/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif, m4aTone, svg } from "../../helpers/media-fixtures";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let cookie: string;
beforeAll(async () => {
  ctx = await startAppContext();
  await ensureProfile(ctx.db, "web-writer");
  cookie = (await startSession(ctx.db, "web-writer")).split(";")[0];
});
afterAll(async () => ctx?.stop());

type Upload = { name: string; data: Buffer; type: string; field?: string };
function post(fields: Record<string, string>, files: Upload[] = [], headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append(f.field ?? "images", new File([new Uint8Array(f.data)], f.name, { type: f.type }));
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

  it("publishes an article from the editor with image and audio in place", async () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Walk" }] },
        { type: "paragraph", content: [{ type: "text", text: "Before " }, { type: "text", text: "image", marks: [{ type: "bold" }] }] },
        { type: "image", attrs: { file: 0 } },
        { type: "paragraph", content: [{ type: "text", text: "Then audio" }] },
        { type: "audio", attrs: { file: 1 } },
      ],
    });
    const res = await post({ mode: "long", title: "Autumn", doc }, [
      { name: "a.jpg", data: await jpegWithExif(), type: "image/jpeg", field: "media" },
      { name: "t.m4a", data: m4aTone(), type: "audio/mp4", field: "media" },
    ]);
    expect(res.headers.get("location")).toMatch(/^\/p\//);
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.kind).toBe("article");
    expect(row.title).toBe("Autumn");
    const rev = await ctx.db.selectFrom("post_revision").selectAll().where("id", "=", row.current_revision_id!).executeTakeFirstOrThrow();
    const blocks = (rev.document as { blocks: { type: string; text?: string }[] }).blocks;
    expect(blocks.map((b) => b.type)).toEqual(["text", "image", "text", "audio"]);
    expect(blocks[0].text).toBe("## Walk\n\nBefore **image**");
  });

  it("keeps a short post with images short and shows its thumbnails in the feed", async () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Sunset by the river" }] }, { type: "image", attrs: { file: 0 } }] });
    const res = await post({ mode: "short", title: "ignored", doc }, [{ name: "a.jpg", data: await jpegWithExif(), type: "image/jpeg", field: "media" }]);
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.kind).toBe("short");
    expect(row.title).toBe("");
    const html = await (await homeRoute(new Request(`${BASE}/`, { headers: { "accept-language": "en", cookie: `${cookie}; ni_sso=1` } }))).text();
    expect(html).toContain("Sunset by the river");
    expect(html).toContain('class="ni-fc-thumbs"');
    expect(html).toContain('src="/scripts/compose.js?v=');
  });

  it("limits short posts to 500 characters and publishes audio without JS", async () => {
    const long = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(501) }] }] });
    expect((await post({ mode: "short", doc: long })).headers.get("location")).toBe("/?compose=short_too_long#compose");
    const res = await post({ mode: "short", text: "Listen" }, [{ name: "t.m4a", data: m4aTone(), type: "audio/mp4", field: "audios" }]);
    const slug = res.headers.get("location")!.replace("/p/", "");
    const row = await ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
    expect(row.kind).toBe("short");
    expect((await post({ mode: "long", doc: long }, [{ name: "a.jpg", data: await jpegWithExif(), type: "image/jpeg", field: "media" }])).headers.get("location")).toMatch(/^\/p\//);
    const badRef = JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { file: 3 } }] });
    expect((await post({ mode: "long", doc: badRef })).headers.get("location")).toBe("/?compose=failed#compose");
  });

  it("rejects empty posts, non-images, other origins and signed-out visitors", async () => {
    expect((await post({ title: "", text: "  " })).headers.get("location")).toBe("/?compose=empty#compose");
    expect((await post({ text: "x" }, [{ name: "x.svg", data: svg(), type: "image/svg+xml" }])).headers.get("location")).toBe("/?compose=unsupported#compose");
    expect((await post({ text: "x" }, [], { origin: "https://evil.test" })).status).toBe(403);
    expect((await post({ text: "x" }, [], { cookie: "" })).headers.get("location")).toBe("/auth/sign-in?next=%2F");
    expect((await post({ text: "x" }, [], { "cf-ipcountry": "CN" })).status).toBe(451);
  });
});
