import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LARGE_MAX_PIXELS, largeRenditionSize, processImage } from "@/server/media/image";
import { tallPng } from "../../helpers/media-fixtures";

/** Zoom rendition rule (plan docs/plan/2026-10-24-image-viewer.md §4). */
describe("largeRenditionSize", () => {
  it("keeps 12 MP phone photos at full size", () => {
    expect(largeRenditionSize(4032, 3024, 1600)).toEqual({ w: 4032, h: 3024 });
  });
  it("scales 48 MP photos by area to at most 4096 × 4096 worth of pixels", () => {
    const s = largeRenditionSize(8064, 6048, 1600)!;
    expect(s.w * s.h).toBeLessThanOrEqual(LARGE_MAX_PIXELS + s.w);
    expect(s.w * s.h).toBeGreaterThan(LARGE_MAX_PIXELS * 0.99);
    expect(s.w / s.h).toBeCloseTo(8064 / 6048, 2);
  });
  it("panoramas keep their height (area, not long side) and stay within WebP's side limit", () => {
    const pano = largeRenditionSize(12000, 3000, 1600)!;
    expect(pano.h).toBeGreaterThan(2000);
    const strip = largeRenditionSize(40000, 400, 1600)!;
    expect(strip.w).toBeLessThanOrEqual(16383);
  });
  it("is not made for small images and long screenshots (the set already shows every pixel)", () => {
    expect(largeRenditionSize(1448, 1086, 1448)).toBeNull();
    expect(largeRenditionSize(1170, 10800, 1170)).toBeNull();
    expect(largeRenditionSize(1600, 1200, 1600)).toBeNull();
  });
});

describe("processImage zoom rendition", () => {
  const frame = (w: number, h: number, background: string) => sharp({ create: { width: w, height: h, channels: 3, background } });
  const photo = (w: number, h: number) => frame(w, h, "#3366aa").jpeg().toBuffer();
  /** Two-frame animated WebP, wider than the largest responsive rendition. */
  const animation = async (w: number, h: number) =>
    sharp([await frame(w, h, "#3366aa").png().toBuffer(), await frame(w, h, "#aa3366").png().toBuffer()], { join: { animated: true } }).webp().toBuffer();
  const write = (buf: Buffer) => {
    const d = mkdtempSync(path.join(os.tmpdir(), "ni-large-"));
    const file = path.join(d, "in");
    writeFileSync(file, buf);
    return { d, file };
  };

  it("writes large.webp for a wide still photo, without upscaling", async () => {
    const { d, file } = write(await photo(3000, 2000));
    const img = await processImage(file, d, 1e8);
    expect(img.large).toMatchObject({ key: "large.webp", mime: "image/webp", width: 3000, height: 2000 });
    expect(await sharp(path.join(d, "large.webp")).metadata()).toMatchObject({ format: "webp", width: 3000, height: 2000 });
  });

  it("none for small images, long screenshots and animated images", async () => {
    for (const buf of [await photo(1200, 800), await tallPng(1170, 10_000)]) {
      const { d, file } = write(buf);
      expect((await processImage(file, d, 1e8)).large).toBeNull();
    }
    const anim = write(await animation(2400, 1600));
    expect((await sharp(anim.file).metadata()).pages).toBe(2);
    const img = await processImage(anim.file, anim.d, 1e8, { animated: true });
    expect(img.webp.at(-1)?.width).toBe(1600);
    expect(img.large).toBeNull();
  });
});
