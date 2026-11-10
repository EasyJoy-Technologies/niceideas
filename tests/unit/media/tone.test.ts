import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "@/server/media/image";
import { dominantTone } from "@/server/media/tone";

/** Image tone: the dominant colour stored with new images (backdrop of the post-page image frame). */
describe("dominantTone", () => {
  const write = (buf: Buffer) => {
    const d = mkdtempSync(path.join(os.tmpdir(), "ni-tone-"));
    const file = path.join(d, "in");
    writeFileSync(file, buf);
    return { d, file };
  };
  /** Mostly `main` with a smaller `accent` block: the dominant colour is `main`, not the average. */
  const twoColours = (main: string, accent: string) =>
    sharp({ create: { width: 400, height: 300, channels: 3, background: main } })
      .composite([{ input: { create: { width: 120, height: 300, channels: 3, background: accent } }, left: 0, top: 0 }])
      .png()
      .toBuffer();
  /** Distance per channel between two "#rrggbb" colours (the histogram returns bin centres). */
  const near = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 16);

  it("reads the dominant colour as #rrggbb", async () => {
    const { file } = write(await twoColours("#2266cc", "#ee3311"));
    const tone = await dominantTone(file);
    expect(tone).toMatch(/^#[0-9a-f]{6}$/);
    expect(near(tone!, "#2266cc")).toBe(true);
  });

  it("counts transparent parts as white", async () => {
    const { file } = write(await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
    expect(near((await dominantTone(file))!, "#ffffff")).toBe(true);
  });

  it("is null for an unreadable file (an upload never fails for it)", async () => {
    const { file } = write(Buffer.from("not an image"));
    expect(await dominantTone(file)).toBeNull();
  });

  it("processImage returns the tone of the image", async () => {
    const { d, file } = write(await twoColours("#33aa55", "#111111"));
    const img = await processImage(file, d, 1e8);
    expect(near(img.tone!, "#33aa55")).toBe(true);
  });
});
