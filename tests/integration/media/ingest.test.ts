import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { insertPost, updatePost } from "@/server/db/repos/posts";
import { insertRevision, linkRevisionMedia } from "@/server/db/repos/revisions";
import { ApiError } from "@/server/http/errors";
import { ingestUpload, type MediaLimits } from "@/server/media/ingest";
import { mediaKeys } from "@/server/media/keys";
import { projectMediaPublic, recordMediaPublic, withdrawUnreferencedMedia } from "@/server/media/publication";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { LocalStore } from "@/server/storage/local-store";
import type { MediaStores } from "@/server/storage/types";
import { startTestDb } from "../../helpers/pg";
import { jpegWithExif, m4aTone, mp3Tone, mp4Video, smallPngWithAlpha, spooled, svg } from "../../helpers/media-fixtures";

let db: Db;
let stop: () => Promise<void>;
let stores: MediaStores & { privateStore: LocalStore; publicStore: LocalStore };
const limits: MediaLimits = { maxImageBytes: 30e6, maxAudioBytes: 150e6, maxAudioSeconds: 3600, maxImagePixels: 1e8, userQuotaBytes: 5e9 };

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  const root = mkdtempSync(path.join(os.tmpdir(), "ni-store-"));
  stores = { privateStore: new LocalStore(path.join(root, "private")), publicStore: new LocalStore(path.join(root, "public")) };
  await ensureProfile(db, "owner");
});
afterAll(async () => stop?.());

const ingest = (buf: Buffer, over: Partial<{ sha: string; limits: MediaLimits; owner: string }> = {}) => {
  const upload = spooled(buf);
  return ingestUpload(db, stores.privateStore, {
    ownerId: over.owner ?? "owner",
    upload,
    declaredSha256: over.sha ?? upload.sha256,
    limits: over.limits ?? limits,
  });
};
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ApiError ? e.code : String(e)));

describe("image ingest", () => {
  it("auto-orients, derives 480/960/1600 webp + jpeg fallback and strips EXIF/GPS", async () => {
    const { media, created } = await ingest(await jpegWithExif());
    expect(created).toBe(true);
    expect(media).toMatchObject({ kind: "image", width: 2000, height: 3000 });
    const v = media.variants;
    if (v.kind !== "image") throw new Error("expected image");
    expect(v.webp.map((r) => r.width)).toEqual([480, 960, 1600]);
    expect(v.fallback.mime).toBe("image/jpeg");
    const original = await sharp(await jpegWithExif()).metadata();
    expect(original.orientation).toBe(6);
    expect(original.exif).toBeDefined();
    for (const key of mediaKeys(media)) {
      const meta = await sharp(stores.privateStore.resolve(key)).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.height! > meta.width!).toBe(true);
    }
  });

  it("dedupes by hash and keeps alpha as png fallback without upscaling", async () => {
    const png = await smallPngWithAlpha();
    const first = await ingest(png);
    const second = await ingest(png);
    expect(second).toMatchObject({ created: false, media: { id: first.media.id } });
    const v = first.media.variants;
    if (v.kind !== "image") throw new Error("expected image");
    expect(v.webp.map((r) => r.width)).toEqual([300]);
    expect(v.fallback.mime).toBe("image/png");
  });

  it("rejects svg, hash mismatch, oversize, pixel bombs and quota overflow", async () => {
    expect(await code(ingest(svg()))).toBe("media.unsupported_type");
    expect(await code(ingest(await smallPngWithAlpha(), { sha: "0".repeat(64) }))).toBe("media.hash_mismatch");
    const big = await jpegWithExif();
    expect(await code(ingest(Buffer.concat([big, Buffer.from("w")]), { limits: { ...limits, maxImageBytes: 10 } }))).toBe("media.too_large");
    expect(await code(ingest(Buffer.concat([big, Buffer.from("x")]), { limits: { ...limits, maxImagePixels: 1000 } }))).toBe("media.unprocessable");
    expect(await code(ingest(Buffer.concat([big, Buffer.from("y")]), { limits: { ...limits, userQuotaBytes: 1 } }))).toBe("media.quota_exceeded");
  });
});

describe("audio ingest", () => {
  it("accepts m4a and mp3 with duration, normalizes mime", async () => {
    const m4a = await ingest(m4aTone());
    expect(m4a.media).toMatchObject({ kind: "audio", mime: "audio/mp4" });
    expect(m4a.media.duration_ms).toBeGreaterThan(1500);
    const mp3 = await ingest(mp3Tone());
    expect(mp3.media).toMatchObject({ kind: "audio", mime: "audio/mpeg" });
  });
  it("rejects video and over-long audio", async () => {
    expect(await code(ingest(mp4Video()))).toBe("media.unprocessable");
    expect(await code(ingest(mp3Tone(5), { limits: { ...limits, maxAudioSeconds: 1 } }))).toBe("media.unprocessable");
  });
});

describe("public projection", () => {
  it("copies to the public store and withdraws once unreferenced", async () => {
    const { media } = await ingest(Buffer.concat([await smallPngWithAlpha(), Buffer.from("z")]));
    const post = await insertPost(db, { author_id: "owner", kind: "article", source: "web", source_ref: null, slug: "pubpubpubpub01" });
    const rev = await insertRevision(db, { postId: post.id, document: {}, contentHash: "a".repeat(64), sourceUpdatedAt: null });
    await linkRevisionMedia(db, rev.id, [media.id]);
    await projectMediaPublic(stores, [media], "public, max-age=300");
    await updatePost(db, post.id, { current_revision_id: rev.id });
    await recordMediaPublic(db, [media.id]);
    const keys = mediaKeys(media);
    await expect(stores.publicStore.getStream(keys[0])).resolves.toBeDefined();

    await withdrawUnreferencedMedia(db, stores, [media.id]);
    await expect(stores.publicStore.getStream(keys[0])).resolves.toBeDefined();

    await updatePost(db, post.id, { status: "unpublished" });
    await withdrawUnreferencedMedia(db, stores, [media.id]);
    await expect(stores.publicStore.getStream(keys[0])).rejects.toThrow();
    const row = await db.selectFrom("media").selectAll().where("id", "=", media.id).executeTakeFirstOrThrow();
    expect(row.public_at).toBeNull();
    expect(row.detached_at).toBeNull();
  });
});
