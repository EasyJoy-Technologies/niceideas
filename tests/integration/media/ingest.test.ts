import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "kysely";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/client";
import { insertPost, updatePost } from "@/server/db/repos/posts";
import { insertRevision, linkRevisionMedia } from "@/server/db/repos/revisions";
import { ApiError } from "@/server/http/errors";
import { ingestUpload, type MediaLimits } from "@/server/media/ingest";
import { mediaKeys } from "@/server/media/keys";
import { finishPublication, projectMediaPublic, queueVisibilityCheck, recordPublication } from "@/server/media/publication";
import { checkMediaVisibility } from "@/server/media/visibility";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { LocalStore } from "@/server/storage/local-store";
import type { MediaStores } from "@/server/storage/types";
import { startTestDb } from "../../helpers/pg";
import { jpegWithExif, m4aTone, mp3Tone, mp4Video, smallPngWithAlpha, spooled, svg } from "../../helpers/media-fixtures";

let db: Db;
let stop: () => Promise<void>;
let stores: MediaStores & { privateStore: LocalStore; publicStore: LocalStore };
const limits: MediaLimits = { maxImageBytes: 30e6, maxAudioBytes: 150e6, maxAudioSeconds: 3600, maxImagePixels: 1e8 };

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  const root = mkdtempSync(path.join(os.tmpdir(), "ni-store-"));
  stores = { privateStore: new LocalStore(path.join(root, "private")), publicStore: new LocalStore(path.join(root, "public")) };
  await ensureProfile(db, "owner");
  await ensureProfile(db, "other");
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
    // 6 MP, wider than 1600: the viewer's zoom rendition keeps every pixel.
    expect(v.large).toMatchObject({ mime: "image/webp", width: 2000, height: 3000 });
    expect(mediaKeys(media)).toContain(v.large!.key);
    expect(media.byte_size).toBe([...v.webp, v.fallback, v.large!].reduce((n, r) => n + r.bytes, 0));
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
    expect(v.large).toBeUndefined();
  });

  it("rejects svg, hash mismatch, oversize and pixel bombs (no per-user quota)", async () => {
    expect(await code(ingest(svg()))).toBe("media.unsupported_type");
    expect(await code(ingest(await smallPngWithAlpha(), { sha: "0".repeat(64) }))).toBe("media.hash_mismatch");
    const big = await jpegWithExif();
    expect(await code(ingest(Buffer.concat([big, Buffer.from("w")]), { limits: { ...limits, maxImageBytes: 10 } }))).toBe("media.too_large");
    expect(await code(ingest(Buffer.concat([big, Buffer.from("x")]), { limits: { ...limits, maxImagePixels: 1000 } }))).toBe("media.unprocessable");
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
    // Different owner: the same bytes were accepted above for "owner" and would dedupe.
    expect(await code(ingest(mp3Tone(), { owner: "other", limits: { ...limits, maxAudioSeconds: 1 } }))).toBe("media.unprocessable");
  });
});

describe("public projection", () => {
  const rt = () => ({ db, stores, cacheControl: "public, max-age=300" });
  const row = (id: string) => db.selectFrom("media").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

  it("moves to the public store for a live post and back once no live post uses it", async () => {
    const { media } = await ingest(Buffer.concat([await smallPngWithAlpha(), Buffer.from("z")]));
    const post = await insertPost(db, { author_id: "owner", kind: "article", source: "web", source_ref: null, slug: "pubpubpubpub01" });
    const rev = await insertRevision(db, { postId: post.id, document: {}, contentHash: "a".repeat(64), sourceUpdatedAt: null });
    await linkRevisionMedia(db, rev.id, [media.id]);
    const projection = await projectMediaPublic(rt(), [media]);
    await updatePost(db, post.id, { current_revision_id: rev.id });
    await finishPublication(rt(), projection, await recordPublication(db, projection, [media.id]));
    const keys = mediaKeys(media);
    expect(await stores.publicStore.exists(keys[0])).toBe(true);
    expect((await row(media.id)).visibility_due_at).toBeNull();

    // Still used by a live post: a check leaves it public.
    await queueVisibilityCheck(db, [media.id]);
    await checkMediaVisibility(rt(), [media.id]);
    expect(await stores.publicStore.exists(keys[0])).toBe(true);

    await updatePost(db, post.id, { status: "unpublished" });
    await queueVisibilityCheck(db, [media.id]);
    await checkMediaVisibility(rt(), [media.id]);
    expect(await stores.publicStore.exists(keys[0])).toBe(false);
    expect(await stores.privateStore.exists(keys[0])).toBe(true);
    expect(await row(media.id)).toMatchObject({ public_at: null, detached_at: null, visibility_due_at: null });
  });

  it("F06: media moved for a publish that never commits go back once the lease runs out", async () => {
    const { media } = await ingest(Buffer.concat([await smallPngWithAlpha(), Buffer.from("lease")]));
    const keys = mediaKeys(media);
    await projectMediaPublic(rt(), [media]);
    // The process dies before the commit: nothing records the move except the lease.
    expect(await stores.publicStore.exists(keys[0])).toBe(true);
    await checkMediaVisibility(rt(), [media.id]);
    expect(await stores.publicStore.exists(keys[0])).toBe(true);
    await db.updateTable("media").set({ visibility_due_at: new Date(Date.now() - 1000) }).where("id", "=", media.id).execute();
    await checkMediaVisibility(rt(), [media.id]);
    expect(await stores.publicStore.exists(keys[0])).toBe(false);
    expect(await row(media.id)).toMatchObject({ public_at: null, visibility_due_at: null });
  });

  it("F20: an upload failing after some objects were stored leaves none behind", async () => {
    const stored: string[] = [];
    let calls = 0;
    const put = stores.privateStore.putFile.bind(stores.privateStore);
    const spy = vi.spyOn(stores.privateStore, "putFile").mockImplementation(async (key: string, file: string) => {
      if (calls++ >= 1) throw new Error("injected storage failure");
      await put(key, file);
      stored.push(key);
    });
    try {
      await expect(ingest(Buffer.concat([await smallPngWithAlpha(), Buffer.from("f20")]))).rejects.toThrow("injected storage failure");
    } finally {
      spy.mockRestore();
    }
    expect(stored).toHaveLength(1);
    expect(await stores.privateStore.exists(stored[0])).toBe(false);
    expect(await db.selectFrom("media_upload").select("prefix").execute()).toEqual([]);
  });

  it("F20: a media row that cannot be written leaves no objects", async () => {
    const stored: string[] = [];
    const put = stores.privateStore.putFile.bind(stores.privateStore);
    const spy = vi.spyOn(stores.privateStore, "putFile").mockImplementation(async (key: string, file: string) => {
      await put(key, file);
      stored.push(key);
    });
    await sql`CREATE FUNCTION f20_refuse_media() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected media insert failure'; END; $$`.execute(db);
    await sql`CREATE TRIGGER f20_refuse_media BEFORE INSERT ON media FOR EACH ROW EXECUTE FUNCTION f20_refuse_media()`.execute(db);
    try {
      await expect(ingest(Buffer.concat([await smallPngWithAlpha(), Buffer.from("f20-row")]))).rejects.toThrow("injected media insert failure");
    } finally {
      spy.mockRestore();
      await sql`DROP TRIGGER f20_refuse_media ON media`.execute(db);
      await sql`DROP FUNCTION f20_refuse_media()`.execute(db);
    }
    expect(stored.length).toBeGreaterThan(0);
    for (const key of stored) expect(await stores.privateStore.exists(key)).toBe(false);
    expect(await db.selectFrom("media_upload").select("prefix").execute()).toEqual([]);
  });
});
