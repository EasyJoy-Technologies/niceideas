import { spawnSync } from "node:child_process";
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

/** Small committed audio/video fixtures (generated once with ffmpeg; CI needs no ffmpeg). */
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/media");
export const m4aTone = () => readFileSync(path.join(FIXTURES, "tone-2s.m4a"));
export const mp3Tone = () => readFileSync(path.join(FIXTURES, "tone-3s.mp3"));
export const mp4Video = () => readFileSync(path.join(FIXTURES, "video-1s.mp4"));
/** NiceNote formats beyond web uploads (made with pillow-heif, ImageMagick and ffmpeg). */
export const heicPhoto = () => readFileSync(path.join(FIXTURES, "photo-64x48.heic"));
export const bmpPhoto = () => readFileSync(path.join(FIXTURES, "photo-64x48.bmp"));
export const animatedGif = () => readFileSync(path.join(FIXTURES, "anim-3f.gif"));
export const wavTone = () => readFileSync(path.join(FIXTURES, "tone-1s.wav"));
export const flacTone = () => readFileSync(path.join(FIXTURES, "tone-1s.flac"));
export const opusTone = () => readFileSync(path.join(FIXTURES, "tone-1s.opus"));
/** AAC / M4A with title, artist, comment and location tags. */
export const taggedM4a = () => readFileSync(path.join(FIXTURES, "tagged-1s.m4a"));

/** True when the worker's media tools are installed (the media pipeline tests need them; CI runners may not have them). */
export function hasMediaTools(): boolean {
  return ["ffmpeg", "ffprobe", "magick"].every((t) => spawnSync(t, ["-version"], { stdio: "ignore" }).status === 0);
}

export async function tallPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#22aa66" } }).png({ compressionLevel: 9 }).toBuffer();
}

/** Writes a buffer to a spool-like temp dir (mirrors spoolBody output). */
export function spooled(buf: Buffer) {
  const dir = fixtureDir();
  const file = path.join(dir, "upload");
  writeFileSync(file, buf);
  return { dir, file, bytes: buf.length, sha256: sha256(buf) };
}
