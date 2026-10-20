import { existsSync } from "node:fs";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { DELETE as withdrawRoute } from "@/app/api/v1/posts/[id]/route";
import { POST as mediaRoute } from "@/app/api/v1/media/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { mediaKeys } from "@/server/media/keys";
import { runMaintenance } from "@/server/maintenance/run-maintenance";
import { removePost, restorePost } from "@/server/moderation/admin";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";
import { jpegWithExif, sha256, smallPngWithAlpha } from "../../helpers/media-fixtures";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
let token: string;
beforeAll(async () => {
  ctx = await startAppContext();
  token = await ctx.tokenFor("maint-user");
});
afterAll(async () => ctx?.stop());

async function upload(buf: Buffer) {
  const req = new Request("http://x/api/v1/media", { method: "POST", body: new Uint8Array(buf), headers: { authorization: `Bearer ${token}`, "x-content-sha256": sha256(buf) } });
  return (await (await mediaRoute(req, {})).json()).media.id as string;
}
async function publish(ref: string, mediaId: string) {
  const doc = { version: 1, title: ref, blocks: [{ type: "text", text: "x" }, { type: "image", mediaId }] };
  const res = await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document: doc, sourceRef: ref, sourceUpdatedAt: "2026-10-20T00:00:00Z" }), {});
  return (await res.json()).post as { id: string; slug: string };
}
const status = async (slug: string) => (await pageRoute(new Request(`http://localhost:3000/p/${slug}`), params({ slug }))).status;
const media = (id: string) => ctx.db.selectFrom("media").selectAll().where("id", "=", id).executeTakeFirst();
const rt = () => ({ db: ctx.db, stores: ctx.stores, cacheControl: "public, max-age=300", retentionDays: 30 });

describe("moderation takedown / restore", () => {
  it("removes a post (410, media private only), restores it (200, media public again), audited", async () => {
    const img = await upload(await jpegWithExif());
    const post = await publish("mod", img);
    const op = { actorId: "ops-1", reason: "test" };
    await removePost(rt(), op, post.slug);
    expect(await status(post.slug)).toBe(410);
    const m = (await media(img))!;
    expect(m.public_at).toBeNull();
    expect(existsSync(ctx.stores.publicStore.resolve(mediaKeys(m)[0]))).toBe(false);
    await restorePost(rt(), op, post.slug);
    expect(await status(post.slug)).toBe(200);
    expect((await media(img))!.public_at).not.toBeNull();
    expect(existsSync(ctx.stores.publicStore.resolve(mediaKeys(m)[0]))).toBe(true);
    const audit = await ctx.db.selectFrom("moderation_action").select("action").where("post_id", "=", post.id).orderBy("created_at").execute();
    expect(audit.map((a) => a.action)).toEqual(["remove", "restore"]);
  });
});

describe("daily maintenance", () => {
  it("purges expired posts with their media, and old never-published uploads; keeps live data", async () => {
    const goneImg = await upload(await smallPngWithAlpha());
    const gone = await publish("gone", goneImg);
    await withdrawRoute(jsonRequest("DELETE", `/api/v1/posts/${gone.id}`, token), params({ id: gone.id }));
    await ctx.db.updateTable("post").set({ purge_after: sql<Date>`now() - interval '1 day'` }).where("id", "=", gone.id).execute();

    const orphanBuf = Buffer.concat([await jpegWithExif(), Buffer.from("orphan")]);
    const orphan = await upload(orphanBuf);
    await ctx.db.updateTable("media").set({ created_at: sql<Date>`now() - interval '8 days'` } as never).where("id", "=", orphan).execute();
    const freshOrphan = await upload(Buffer.concat([await jpegWithExif(), Buffer.from("fresh")]));

    const liveImg = await upload(Buffer.concat([await jpegWithExif(), Buffer.from("live")]));
    const live = await publish("live", liveImg);

    const goneKeys = mediaKeys((await media(goneImg))!);
    const report = await runMaintenance(ctx.db, ctx.stores);
    expect(report.postsPurged).toBe(1);
    expect(report.mediaDeleted).toBe(2);
    expect(await ctx.db.selectFrom("post").select("id").where("id", "=", gone.id).executeTakeFirst()).toBeUndefined();
    expect(await status(gone.slug)).toBe(404);
    expect(await media(goneImg)).toBeUndefined();
    expect(existsSync(ctx.stores.privateStore.resolve(goneKeys[0]))).toBe(false);
    expect(await media(orphan)).toBeUndefined();
    expect(await media(freshOrphan)).toBeDefined();
    expect(await media(liveImg)).toBeDefined();
    expect(await status(live.slug)).toBe(200);
    expect((await runMaintenance(ctx.db, ctx.stores)).postsPurged).toBe(0);
  });
});
