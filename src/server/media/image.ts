import path from "node:path";
import sharp from "sharp";
import type { MediaRendition } from "@/server/db/schema";

/** Responsive widths (plan §6). Never upscaled. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;
const FALLBACK_MAX_WIDTH = 1600;

export type ProcessedImage = {
  width: number;
  height: number;
  /** Renditions written to `workDir`; `key` is the file name, prefixed with the media key later. */
  webp: MediaRendition[];
  fallback: MediaRendition;
};

export class ImageRejectedError extends Error {}

/**
 * Decodes the image (first frame only), applies EXIF orientation, and writes
 * webp renditions plus one jpeg/png fallback. sharp drops all metadata
 * (EXIF/GPS/XMP) unless explicitly asked to keep it, so outputs carry none.
 */
export async function processImage(input: string, workDir: string, maxPixels: number): Promise<ProcessedImage> {
  const base = () => sharp(input, { limitInputPixels: maxPixels, animated: false, failOn: "error" }).autoOrient();

  let meta;
  try {
    meta = await base().metadata();
  } catch {
    throw new ImageRejectedError("undecodable");
  }
  // Dimensions after EXIF orientation is applied.
  const { width, height } = meta.autoOrient ?? { width: 0, height: 0 };
  if (!width || !height) throw new ImageRejectedError("no dimensions");

  const targets = IMAGE_WIDTHS.filter((w) => w < width);
  if (targets.length < IMAGE_WIDTHS.length) targets.push(Math.min(width, IMAGE_WIDTHS.at(-1)!) as (typeof IMAGE_WIDTHS)[number]);

  const webp: MediaRendition[] = [];
  for (const target of [...new Set(targets)]) {
    const name = `w${target}.webp`;
    const info = await base().resize({ width: target, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(workDir, name));
    webp.push({ key: name, mime: "image/webp", bytes: info.size, width: info.width, height: info.height });
  }

  const usePng = meta.hasAlpha === true;
  const fallbackName = usePng ? "fallback.png" : "fallback.jpg";
  const pipeline = base().resize({ width: FALLBACK_MAX_WIDTH, withoutEnlargement: true });
  const info = await (usePng ? pipeline.png({ compressionLevel: 9 }) : pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 85, mozjpeg: true }))
    .toFile(path.join(workDir, fallbackName));

  return {
    width,
    height,
    webp,
    fallback: { key: fallbackName, mime: usePng ? "image/png" : "image/jpeg", bytes: info.size, width: info.width, height: info.height },
  };
}
