import path from "node:path";
import { getConfig } from "@/server/config/env";
import { ImageRejectedError } from "./image";
import { runTool, ToolError } from "./run-tool";

/** Formats sharp cannot read, decoded by ImageMagick (HEIC / HEIF through libheif). Coder names are explicit. */
export type ConvertibleFormat = "heic" | "bmp";

/** ImageMagick resource limits: bounded memory, spill to disk, and a time cap per image. */
const LIMITS = ["-limit", "memory", "512MiB", "-limit", "map", "1GiB", "-limit", "disk", "4GiB", "-limit", "time", "300"];
const TIMEOUT_MS = 6 * 60_000;

/**
 * Converts the first image of a HEIC / HEIF / BMP file to a lossless PNG in `workDir` for the normal
 * pipeline (HEIF rotation and mirroring are applied by libheif; metadata is stripped). The size is read
 * first, so images over `maxPixels` are refused before decoding.
 */
export async function convertToPng(input: string, format: ConvertibleFormat, workDir: string, maxPixels: number, signal?: AbortSignal): Promise<string> {
  const magick = getConfig().MAGICK_PATH;
  const source = `${format}:${input}[0]`;
  let dims: string;
  try {
    dims = await runTool(magick, ["identify", ...LIMITS, "-ping", "-format", "%w %h", source], { timeoutMs: 60_000, signal });
  } catch (err) {
    throw rejectOrRethrow(err);
  }
  const [w, h] = dims.trim().split(/\s+/).map(Number);
  if (!w || !h) throw new ImageRejectedError("decode_failed", "no dimensions");
  if (w * h > maxPixels) throw new ImageRejectedError("too_large", `${w}x${h}`);
  const out = path.join(workDir, "converted.png");
  try {
    await runTool(magick, [...LIMITS, "-limit", "area", String(maxPixels), source, "-strip", "-depth", "8", `png:${out}`], { timeoutMs: TIMEOUT_MS, signal });
  } catch (err) {
    throw rejectOrRethrow(err);
  }
  return out;
}

/** The tool refused the file or took too long on it → decode_failed; a missing tool or an abort (shutdown) stays an error (retried later). */
function rejectOrRethrow(err: unknown): unknown {
  if (err instanceof ToolError && (err.code !== null || err.timedOut)) return new ImageRejectedError("decode_failed", err.timedOut ? "timed out" : err.stderr.slice(-200));
  return err;
}
