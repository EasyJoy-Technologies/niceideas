import path from "node:path";
import sharp from "sharp";
import type { MediaRendition } from "@/server/db/schema";

/** Responsive widths (plan §6). Never upscaled. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;
const FALLBACK_MAX_WIDTH = 1600;
/** WebP cannot be taller than this; taller renditions are JPEG (PNG with transparency). */
const WEBP_MAX_SIDE = 16383;
/** JPEG's limit (65535) with a margin: very tall images are narrowed until they fit (no slicing). */
const MAX_HEIGHT = 65500;
const TRANSIENT = /no space left|ENOSPC|EIO|out of memory|cannot allocate/i;

export type ProcessedImage = {
  width: number;
  height: number;
  /** Responsive renditions written to `workDir` (WebP; JPEG / PNG when too tall for WebP); `key` is the file name. */
  webp: MediaRendition[];
  /** Static (first frame) JPEG / PNG for browsers without WebP and for the share card. */
  fallback: MediaRendition;
};

export type ImageRejectReason = "too_large" | "decode_failed";

export class ImageRejectedError extends Error {
  constructor(
    readonly reason: ImageRejectReason,
    detail: string,
  ) {
    super(detail);
  }
}

/** Output size for a target width: never upscaled, narrowed so the height stays within MAX_HEIGHT. */
function fitWidth(target: number, width: number, height: number): { w: number; h: number } {
  const w = Math.max(1, Math.min(target, width, Math.floor((MAX_HEIGHT * width) / height)));
  return { w, h: Math.max(1, Math.round((height * w) / width)) };
}

/**
 * Decodes the image, applies EXIF orientation, and writes responsive renditions plus one static
 * fallback. `animated` (NiceNote shares): animated GIF / WebP keep their animation in the WebP
 * renditions when all frames fit the pixel limit (otherwise the first frame is used). sharp drops
 * all metadata (EXIF/GPS/XMP) unless explicitly asked to keep it, so outputs carry none.
 */
export async function processImage(input: string, workDir: string, maxPixels: number, opts: { animated?: boolean } = {}): Promise<ProcessedImage> {
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: false, animated: false }).metadata();
  } catch {
    throw new ImageRejectedError("decode_failed", "undecodable");
  }
  const rawW = meta.width ?? 0;
  const rawH = meta.pageHeight ?? meta.height ?? 0;
  if (!rawW || !rawH) throw new ImageRejectedError("decode_failed", "no dimensions");
  if (rawW * rawH > maxPixels) throw new ImageRejectedError("too_large", `${rawW}x${rawH}`);
  const pages = meta.pages ?? 1;
  // Dimensions after EXIF orientation is applied.
  const { width, height } = meta.autoOrient ?? { width: rawW, height: rawH };
  const animated = !!opts.animated && pages > 1 && rawW * rawH * pages <= maxPixels;

  const stillImage = () => sharp(input, { limitInputPixels: maxPixels, animated: false, failOn: "error" }).autoOrient();
  const usePng = meta.hasAlpha === true;
  try {
    const targets = IMAGE_WIDTHS.filter((w) => w < width);
    if (targets.length < IMAGE_WIDTHS.length) targets.push(Math.min(width, IMAGE_WIDTHS.at(-1)!) as (typeof IMAGE_WIDTHS)[number]);
    const sizes = [...new Map(targets.map((t) => fitWidth(t, width, height)).map((s) => [s.w, s])).values()];

    const webp: MediaRendition[] = [];
    for (const { w, h } of sizes) {
      const asWebp = Math.max(w, h) <= WEBP_MAX_SIDE;
      const name = asWebp ? `w${w}.webp` : `w${w}.${usePng ? "png" : "jpg"}`;
      const file = path.join(workDir, name);
      let info;
      if (asWebp && animated) {
        info = await sharp(input, { limitInputPixels: maxPixels, animated: true, failOn: "error" }).resize({ width: w }).webp({ quality: 80 }).toFile(file);
        info = { ...info, height: info.height / pages };
      } else {
        const p = stillImage().resize({ width: w, withoutEnlargement: true });
        info = await (asWebp ? p.webp({ quality: 82 }) : usePng ? p.png({ compressionLevel: 9 }) : p.flatten({ background: "#ffffff" }).jpeg({ quality: 85, mozjpeg: true })).toFile(file);
      }
      webp.push({ key: name, mime: asWebp ? "image/webp" : usePng ? "image/png" : "image/jpeg", bytes: info.size, width: info.width, height: Math.round(info.height) });
    }

    const fb = fitWidth(FALLBACK_MAX_WIDTH, width, height);
    const fallbackName = usePng ? "fallback.png" : "fallback.jpg";
    const pipeline = stillImage().resize({ width: fb.w, withoutEnlargement: true });
    const info = await (usePng ? pipeline.png({ compressionLevel: 9 }) : pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 85, mozjpeg: true })).toFile(path.join(workDir, fallbackName));
    return {
      width,
      height,
      webp,
      fallback: { key: fallbackName, mime: usePng ? "image/png" : "image/jpeg", bytes: info.size, width: info.width, height: info.height },
    };
  } catch (err) {
    // Disk / memory trouble is not the image's fault: let the caller retry later.
    if (err instanceof ImageRejectedError || (err instanceof Error && TRANSIENT.test(err.message))) throw err;
    throw new ImageRejectedError("decode_failed", err instanceof Error ? err.message.slice(0, 200) : "decode failed");
  }
}
