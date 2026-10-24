import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MediaKind } from "@/server/db/schema";
import { ingestShareMedia, MediaUnusableError } from "@/server/media/ingest-share";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { removeTempDir } from "@/server/util/temp-file";
import { startAppContext } from "../../helpers/app-context";
import { animatedGif, bmpPhoto, flacTone, hasMediaTools, heicPhoto, jpegWithExif, m4aTone, mp3Tone, mp4Video, opusTone, smallPngWithAlpha, spooled, tallPng, wavTone } from "../../helpers/media-fixtures";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
const OWNER = "pipe-user";
/** Nothing stored yet (an owner's stored file is reused before any check). */
const FRESH = "pipe-fresh";

async function ingest(buf: Buffer, kind: MediaKind, maxImagePixels = 100_000_000, ownerId = OWNER) {
  const file = spooled(buf);
  try {
    return await ingestShareMedia(ctx.db, ctx.stores.privateStore, { ownerId, kind, file, maxImagePixels });
  } finally {
    await removeTempDir(file.dir);
  }
}
const reason = (p: Promise<unknown>) => p.then(() => "stored", (e: unknown) => (e instanceof MediaUnusableError ? e.reason : `error: ${String(e)}`));
const stored = async (key: string) => Buffer.concat(await (await ctx.stores.privateStore.getStream(key)).toArray());

describe.skipIf(!hasMediaTools())("NiceNote media pipeline (ffmpeg / ImageMagick)", () => {
  beforeAll(async () => {
    ctx = await startAppContext();
    await ensureProfile(ctx.db, OWNER);
    await ensureProfile(ctx.db, FRESH);
  });
  afterAll(async () => ctx?.stop());

  it("images: HEIC and BMP are decoded, EXIF is applied and dropped, the same file is stored once", async () => {
    const heic = await ingest(heicPhoto(), "image");
    expect([heic.mime, heic.width, heic.height]).toEqual(["image/heic", 64, 48]);
    expect(heic.variants.kind === "image" && heic.variants.webp.map((r) => r.mime)).toEqual(["image/webp"]);
    const bmp = await ingest(bmpPhoto(), "image");
    expect([bmp.mime, bmp.width]).toEqual(["image/bmp", 64]);
    const jpeg = await ingest(await jpegWithExif(), "image");
    expect([jpeg.width, jpeg.height]).toEqual([2000, 3000]);
    expect((await ingest(await jpegWithExif(), "image")).id).toBe(jpeg.id);
    const png = await ingest(await smallPngWithAlpha(), "image");
    expect(png.variants.kind === "image" && png.variants.fallback.mime).toBe("image/png");
  });

  it("animated GIF keeps its animation in WebP; the fallback is the first frame", async () => {
    const gif = await ingest(animatedGif(), "image");
    if (gif.variants.kind !== "image") throw new Error("not an image");
    const webp = await sharp(await stored(gif.variants.webp[0].key)).metadata();
    expect([webp.format, webp.pages]).toEqual(["webp", 3]);
    expect(gif.variants.webp[0].height).toBe(30);
    expect((await sharp(await stored(gif.variants.fallback.key)).metadata()).pages ?? 1).toBe(1);
  });

  it("very tall images use JPEG renditions and are narrowed to at most 65500 px high", async () => {
    const tall = await ingest(await tallPng(200, 20_000), "image");
    if (tall.variants.kind !== "image") throw new Error("not an image");
    expect(tall.variants.webp.map((r) => [r.mime, r.width, r.height])).toEqual([["image/jpeg", 200, 20_000]]);
    const huge = await ingest(await tallPng(100, 100_000), "image");
    if (huge.variants.kind !== "image") throw new Error("not an image");
    expect(huge.variants.webp.map((r) => [r.width, r.height])).toEqual([[65, 65_000]]);
    expect(huge.variants.fallback.height).toBeLessThanOrEqual(65_500);
  });

  it("refuses files that can never work, with the contract's reason", async () => {
    expect(await reason(ingest(heicPhoto(), "image", 1000, FRESH))).toBe("too_large");
    expect(await reason(ingest(await tallPng(50, 50), "image", 1000, FRESH))).toBe("too_large");
    expect(await reason(ingest(Buffer.from("just text, not an image"), "image"))).toBe("unsupported_format");
    const broken = Buffer.concat([(await tallPng(40, 40)).subarray(0, 60), Buffer.alloc(200, 7)]);
    expect(await reason(ingest(broken, "image"))).toBe("decode_failed");
    expect(await reason(ingest(mp4Video(), "audio"))).toBe("unsupported_format");
    expect(await reason(ingest(bmpPhoto(), "audio"))).toBe("unsupported_format");
    expect(await reason(ingest(Buffer.from("not audio either"), "audio"))).toBe("unsupported_format");
    // A file stored as audio cannot be an image block.
    await ingest(mp3Tone(), "audio");
    expect(await reason(ingest(mp3Tone(), "image"))).toBe("unsupported_format");
  });

  it("audio: AAC is re-wrapped, MP3 kept, other formats become AAC / M4A; durations are read", async () => {
    const m4a = await ingest(m4aTone(), "audio");
    expect([m4a.mime, Math.round((m4a.duration_ms ?? 0) / 1000)]).toEqual(["audio/mp4", 2]);
    const mp3 = await ingest(mp3Tone(), "audio");
    expect(mp3.mime).toBe("audio/mpeg");
    for (const tone of [wavTone(), flacTone(), opusTone()]) {
      const a = await ingest(tone, "audio");
      expect(a.mime).toBe("audio/mp4");
      expect(a.variants.kind === "audio" && a.variants.original.key.endsWith(".m4a")).toBe(true);
      expect(Math.round((a.duration_ms ?? 0) / 1000)).toBe(1);
    }
  });
});
