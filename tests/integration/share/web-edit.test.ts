import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as composeRoute } from "@/app/api/web/compose/route";
import { POST as editRoute } from "@/app/api/web/posts/edit/route";
import { GET as editPageRoute } from "@/app/p/[slug]/edit/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { startSession } from "@/server/auth/web/session";
import { findRevision } from "@/server/db/repos/revisions";
import { mediaKeys } from "@/server/media/keys";
import { pushShareContent } from "@/server/nicenote/push-content";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import type { LocalStore } from "@/server/storage/local-store";
import { params } from "../../helpers/api";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif } from "../../helpers/media-fixtures";
import { deleteAs, shareFromNiceNote } from "../../helpers/publish";

const BASE = "http://localhost:3000";
const USER = "edit-writer";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let cookie: string;
let otherCookie: string;
beforeAll(async () => {
  ctx = await startAppContext();
  await ensureProfile(ctx.db, USER);
  await ensureProfile(ctx.db, "edit-other");
  cookie = (await startSession(ctx.db, USER)).split(";")[0];
  otherCookie = (await startSession(ctx.db, "edit-other")).split(";")[0];
});
afterAll(async () => ctx?.stop());

const form = (fields: Record<string, string | string[]>, files: File[] = []) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  for (const file of files) f.append("media", file);
  return f;
};
const send = (route: typeof editRoute, path: string, body: FormData, c = cookie) => route(new Request(`${BASE}${path}`, { method: "POST", body, headers: { origin: BASE, cookie: c } }));
const postRow = (slug: string) => ctx.db.selectFrom("post").selectAll().where("slug", "=", slug).executeTakeFirstOrThrow();
const page = async (slug: string, c = cookie) => (await pageRoute(new Request(`${BASE}/p/${slug}`, { headers: { "accept-language": "en", cookie: c } }), params({ slug }))).text();
const editPage = (slug: string, c = cookie) => editPageRoute(new Request(`${BASE}/p/${slug}/edit`, { headers: { "accept-language": "en", cookie: c } }), params({ slug }));
const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const jpeg = async (tag: string) => new File([new Uint8Array(Buffer.concat([await jpegWithExif(), Buffer.from(tag)]))], `${tag}.jpg`, { type: "image/jpeg" });

let seq = 0;
/** Article with its own image (same bytes would be one shared media row across tests). */
async function publishArticle(): Promise<string> {
  const res = await send(composeRoute, "/api/web/compose", form({ mode: "long", title: "Walk", doc: doc(para("First"), { type: "image", attrs: { file: 0 } }) }, [await jpeg(`a${++seq}`)]));
  return res.headers.get("location")!.replace("/p/", "");
}

describe("web edit", () => {
  it("opens the author's post in the editor, with Edit in the menu; others get 404", async () => {
    const slug = await publishArticle();
    expect(await page(slug)).toContain(`href="/p/${slug}/edit"`);
    expect(await page(slug, otherCookie)).not.toContain(`/p/${slug}/edit`);
    const res = await editPage(slug);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('action="/api/web/posts/edit"');
    expect(html).toContain('value="Walk"');
    expect(html).toContain("data-prefill=");
    expect(html).not.toContain('class="ni-compose-seg"');
    expect(html).toContain(">Save</button>");
    expect((await editPage(slug, otherCookie)).status).toBe(404);
  });

  it("saves a new revision: same link and type, kept and new media, dropped media back to private, marked edited", async () => {
    const slug = await publishArticle();
    const before = await postRow(slug);
    const [oldImage] = (await ctx.db.selectFrom("revision_media").select("media_id").where("revision_id", "=", before.current_revision_id!).execute()).map((r) => r.media_id);
    const body = form({ slug, mode: "short", title: "Walk, edited", doc: doc(para("Changed"), { type: "image", attrs: { file: 0 } }) }, [await jpeg("b")]);
    const res = await send(editRoute, "/api/web/posts/edit", body);
    expect([res.status, res.headers.get("location")]).toEqual([303, `/p/${slug}`]);
    const after = await postRow(slug);
    expect([after.id, after.kind, after.title, after.web_edited]).toEqual([before.id, "article", "Walk, edited", true]);
    expect(after.edited_at).not.toBeNull();
    const rev = await findRevision(ctx.db, after.current_revision_id!);
    expect(rev!.revision_no).toBe(2);
    const old = await ctx.db.selectFrom("media").selectAll().where("id", "=", oldImage).executeTakeFirstOrThrow();
    expect(old.public_at).toBeNull();
    expect(existsSync((ctx.stores.publicStore as LocalStore).resolve(mediaKeys(old)[0]))).toBe(false);
    const html = await page(slug);
    expect(html).toContain("Changed");
    expect(html).toContain('class="ni-edited"');
  });

  it("keeps stored media by id (editor and no-JS form) with their details", async () => {
    const slug = await publishArticle();
    const prefill = (await (await editPage(slug)).text()).match(/data-prefill="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const image = (JSON.parse(prefill) as { doc: { content: { type: string; attrs?: { mediaId?: string } }[] } }).doc.content.find((n) => n.type === "image")!;
    const id = image.attrs!.mediaId!;
    await send(editRoute, "/api/web/posts/edit", form({ slug, title: "Walk", doc: doc(para("Kept"), { type: "image", attrs: { mediaId: id, meta: { caption: "Lake" } } }) }));
    let rev = await findRevision(ctx.db, (await postRow(slug)).current_revision_id!);
    expect((rev!.document as { blocks: unknown[] }).blocks).toEqual([{ type: "text", format: "markdown", text: "Kept" }, { type: "image", mediaId: id, caption: "Lake" }]);
    // No JS: Markdown text + the kept image; its caption stays.
    await send(editRoute, "/api/web/posts/edit", form({ slug, title: "Walk", format: "markdown", text: "**Plain** form", keep_image: id }));
    rev = await findRevision(ctx.db, (await postRow(slug)).current_revision_id!);
    expect((rev!.document as { blocks: unknown[] }).blocks).toEqual([{ type: "text", format: "markdown", text: "**Plain** form" }, { type: "image", mediaId: id, caption: "Lake" }]);
    // Another user's media id is refused.
    const res = await send(editRoute, "/api/web/posts/edit", form({ slug, title: "Walk", doc: doc({ type: "image", attrs: { mediaId: "00000000-0000-4000-8000-000000000000" } }) }));
    expect(res.headers.get("location")).toBe(`/p/${slug}/edit?compose=failed`);
  });

  it("short posts stay short (limit applies); deleted posts cannot be edited", async () => {
    const res = await send(composeRoute, "/api/web/compose", form({ mode: "short", doc: doc(para("Short one")) }));
    const slug = res.headers.get("location")!.replace("/p/", "");
    const tooLong = await send(editRoute, "/api/web/posts/edit", form({ slug, mode: "long", doc: doc(para("x".repeat(600))) }));
    expect(tooLong.headers.get("location")).toBe(`/p/${slug}/edit?compose=short_too_long`);
    await send(editRoute, "/api/web/posts/edit", form({ slug, mode: "long", title: "Ignored", doc: doc(para("Still short")) }));
    const row = await postRow(slug);
    expect([row.kind, row.title]).toEqual(["short", ""]);
    await deleteAs(ctx, row.id);
    expect((await editPage(slug)).status).toBe(409);
    const blocked = await send(editRoute, "/api/web/posts/edit", form({ slug, doc: doc(para("x")) }));
    expect(blocked.headers.get("location")).toBe(`/p/${slug}/edit?compose=failed`);
  });

  it("NiceNote share: a web edit survives a retry of the same version; a newer version replaces it", async () => {
    const rich = (text: string) => ({ version: 1, title: "Note", blocks: [{ type: "rich", lines: [{ kind: "paragraph", runs: [{ text }] }] }] });
    const share = await shareFromNiceNote(ctx, USER, rich("From the app"), { revision: 3 });
    const titleBefore = (await postRow(share.slug)).title;
    const html = await (await editPage(share.slug)).text();
    expect(html).toContain("From the app");
    await send(editRoute, "/api/web/posts/edit", form({ slug: share.slug, title: "Note", doc: doc(para("Edited on the web")) }));
    const push = (rev: number, text: string) => pushShareContent(ctx.db, ctx.stores, "public, max-age=300", share.id, { sourceRevision: rev, document: rich(text) as never, media: {} });
    expect((await postRow(share.slug)).title).toBe(titleBefore);
    expect((await push(3, "From the app")).changed).toBe(false);
    expect(await page(share.slug)).toContain("Edited on the web");
    const newer = await push(4, "App update");
    expect(newer.changed).toBe(true);
    expect(newer.post.web_edited).toBe(false);
    expect(await page(share.slug)).toContain("App update");
  });
});
