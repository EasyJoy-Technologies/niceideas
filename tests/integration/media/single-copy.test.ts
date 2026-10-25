import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaKeys } from "@/server/media/keys";
import { convertToSingleCopy } from "@/server/media/single-copy";
import type { LocalStore } from "@/server/storage/local-store";
import { moveObject } from "@/server/storage/move";
import { ObjectMissingError, type ObjectStore } from "@/server/storage/types";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif } from "../../helpers/media-fixtures";
import { deleteAs, publishAs, uploadAs } from "../../helpers/publish";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  ctx = await startAppContext();
});
afterAll(async () => ctx?.stop());

const priv = () => ctx.stores.privateStore as LocalStore;
const pub = () => ctx.stores.publicStore as LocalStore;
const keysOf = async (id: string) => mediaKeys(await ctx.db.selectFrom("media").select("variants").where("id", "=", id).executeTakeFirstOrThrow());
/** Where each rendition of a media row is stored. */
const where = async (id: string) =>
  [...new Set((await keysOf(id)).map((k) => `${existsSync(priv().resolve(k)) ? "private" : ""}${existsSync(pub().resolve(k)) ? "public" : ""}` || "none"))];
const publish = (userId: string, mediaId: string) => publishAs(ctx, userId, { version: 1, title: "t", blocks: [{ type: "text", text: "x" }, { type: "image", mediaId }] });

describe("one stored copy per media file", () => {
  it("publishing moves renditions to the public store, deleting moves them back", async () => {
    const img = await uploadAs(ctx, "copy-user", Buffer.concat([await jpegWithExif(), Buffer.from("a")]));
    expect(await where(img)).toEqual(["private"]);
    const post = await publish("copy-user", img);
    expect(await where(img)).toEqual(["public"]);
    await deleteAs(ctx, post.id);
    expect(await where(img)).toEqual(["private"]);
  });

  it("moves are idempotent; a key in neither store is an error", async () => {
    const img = await uploadAs(ctx, "copy-user", Buffer.concat([await jpegWithExif(), Buffer.from("b")]));
    const [key] = await keysOf(img);
    await moveObject(priv(), pub(), key, { contentType: "image/webp" });
    await moveObject(priv(), pub(), key, { contentType: "image/webp" });
    expect([existsSync(priv().resolve(key)), existsSync(pub().resolve(key))]).toEqual([false, true]);
    await expect(moveObject(priv(), pub(), "m/none/w480.webp", { contentType: "image/webp" })).rejects.toBeInstanceOf(ObjectMissingError);
  });

  it("converts the old layout (public media copied, not moved) and reports missing renditions", async () => {
    const shown = await uploadAs(ctx, "conv-user", Buffer.concat([await jpegWithExif(), Buffer.from("c")]));
    await publish("conv-user", shown);
    // Old layout: published media were kept in the private store too; a stray public copy of private media.
    for (const k of await keysOf(shown)) await (ctx.stores.publicStore as ObjectStore).copyTo(ctx.stores.privateStore, k, { contentType: "image/webp" });
    const hidden = await uploadAs(ctx, "conv-user", Buffer.concat([await jpegWithExif(), Buffer.from("d")]));
    for (const k of await keysOf(hidden)) await (ctx.stores.privateStore as ObjectStore).copyTo(ctx.stores.publicStore, k, { contentType: "image/webp" });
    expect([await where(shown), await where(hidden)]).toEqual([["privatepublic"], ["privatepublic"]]);

    const [lost] = await keysOf(hidden);
    await ctx.stores.privateStore.deleteMany([lost]);
    await ctx.stores.publicStore.deleteMany([lost]);
    const report = await convertToSingleCopy(ctx.db, ctx.stores, "public, max-age=300");
    expect(report.missing).toEqual([lost]);
    expect(await where(shown)).toEqual(["public"]);
    expect((await where(hidden)).sort()).toEqual(["none", "private"]);
    expect((await convertToSingleCopy(ctx.db, ctx.stores, "public, max-age=300")).missing).toEqual([lost]);
  });
});
