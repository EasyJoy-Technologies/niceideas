import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as deleteRoute } from "@/app/api/web/posts/delete/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";
import { params } from "../../helpers/api";
import { publishAs, shareFromNiceNote } from "../../helpers/publish";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let author: string;
let stranger: string;
beforeAll(async () => {
  ctx = await startAppContext();
  await ensureProfile(ctx.db, "del-author");
  await ensureProfile(ctx.db, "del-stranger");
  author = (await startSession(ctx.db, "del-author")).split(";")[0];
  stranger = (await startSession(ctx.db, "del-stranger")).split(";")[0];
});
afterAll(async () => ctx?.stop());

const view = async (slug: string, cookie = "", query = "") => {
  const res = await pageRoute(new Request(`${BASE}/p/${slug}${query}`, { headers: { cookie, "accept-language": "en" } }), params({ slug }));
  return { status: res.status, html: await res.text() };
};
const del = (slug: string, cookie: string, origin = BASE) =>
  deleteRoute(new Request(`${BASE}/api/web/posts/delete`, {
    method: "POST",
    body: new URLSearchParams({ slug, back: `/p/${slug}` }),
    headers: { origin, cookie, "content-type": "application/x-www-form-urlencoded" },
  }));

describe("deleting a post on the web", () => {
  it("only the author sees the delete menu; NiceNote shares explain the original is kept", async () => {
    const shared = await shareFromNiceNote(ctx, "del-author", { version: 1, blocks: [{ type: "text", text: "Shared from the app" }] });
    const own = await view(shared.slug, author);
    expect(own.html).toContain('class="ni-act ni-more-btn" aria-label="More options"');
    expect(own.html).toContain("Delete this post?");
    expect(own.html).toContain("The original in NiceNote is not affected");
    const other = await view(shared.slug, stranger);
    expect(other.html).not.toContain("ni-more-btn");
    expect(other.html).toContain("data-report");
  });

  it("deletes (same-origin, author only), the link answers 410 at once and NiceNote is told", async () => {
    const shared = await shareFromNiceNote(ctx, "del-author", { version: 1, blocks: [{ type: "text", text: "Delete me" }] });
    expect((await del(shared.slug, author, "https://evil.test")).status).toBe(403);
    const foreign = await del(shared.slug, stranger);
    expect(foreign.headers.get("location")).toBe(`/p/${shared.slug}?n=delete_failed`);
    expect((await view(shared.slug)).status).toBe(200);
    const ok = await del(shared.slug, author);
    expect([ok.status, ok.headers.get("location")]).toEqual([303, `/p/${shared.slug}`]);
    const gone = await view(shared.slug);
    expect(gone.status).toBe(410);
    expect(gone.html).toContain("The author has deleted this post.");
    const events = await ctx.db.selectFrom("outbox").select("payload").where("kind", "=", "post_event").execute();
    expect(events.map((e) => e.payload)).toContainEqual(expect.objectContaining({ postId: shared.id, event: "unpublished" }));
  });

  it("web posts have no app note; a failed delete shows a notice to the author", async () => {
    const web = await publishAs(ctx, "del-author", { version: 1, blocks: [{ type: "text", text: "Written on the web" }] });
    const own = await view(web.slug, author, "?n=delete_failed");
    expect(own.html).toContain("Delete this post?");
    expect(own.html).not.toContain("is not affected");
    expect(own.html).toContain("Couldn&#39;t delete the post. Please try again.");
    expect((await del(web.slug, author)).headers.get("location")).toBe(`/p/${web.slug}`);
    expect(await ctx.db.selectFrom("outbox").select("id").where("kind", "=", "post_event").where("payload", "@>", JSON.stringify({ postId: web.id }) as never).executeTakeFirst()).toBeUndefined();
  });
});
