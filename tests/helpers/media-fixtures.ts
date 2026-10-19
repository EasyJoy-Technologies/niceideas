import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
export const fixtureDir = () => mkdtempSync(path.join(os.tmpdir(), "ni-fx-"));

/** JPEG 3000×2000 with EXIF orientation 6 (rotate 90°) and GPS-bearing EXIF. */
export async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#7c3aed" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "53/1 32/1 0/1" } })
    .toBuffer();
}

export async function smallPngWithAlpha(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
}

export const svg = () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');

/** Generates audio / video with ffmpeg (sine tone). */
export function ffmpegFixture(args: string[], ext: string): Buffer {
  const out = path.join(fixtureDir(), `f.${ext}`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, out]);
  return readFileSync(out);
}
export const m4aTone = () => ffmpegFixture(["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac"], "m4a");
export const mp3Tone = (seconds = 3) =>
  ffmpegFixture(["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:a", "libmp3lame"], "mp3");
export const mp4Video = () =>
  ffmpegFixture(["-f", "lavfi", "-i", "testsrc=size=64x64:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "mpeg4", "-c:a", "aac", "-shortest"], "mp4");

/** Writes a buffer to a spool-like temp dir (mirrors spoolBody output). */
export function spooled(buf: Buffer) {
  const dir = fixtureDir();
  const file = path.join(dir, "upload");
  writeFileSync(file, buf);
  return { dir, file, bytes: buf.length, sha256: sha256(buf) };
}
