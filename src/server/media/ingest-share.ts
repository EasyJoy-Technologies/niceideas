import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import type { Db } from "@/server/db/client";
import type { Media, MediaKind, MediaVariants } from "@/server/db/schema";
import { findMediaByOwnerSha } from "@/server/db/repos/media";
import type { ObjectStore } from "@/server/storage/types";
import type { SpooledBody } from "@/server/util/temp-file";
import { AudioUnusableError, toWebAudio } from "./audio-transcode";
import { ImageRejectedError, processImage } from "./image";
import { convertToPng, type ConvertibleFormat } from "./image-convert";
import { insertStoredMedia, newMediaPrefix, storeAudioFile, storeImageRenditions } from "./store-media";

/** Permanent problem with a NiceNote media file (contract §4.2 reason codes); the same ref would fail again. */
export class MediaUnusableError extends Error {
  constructor(readonly reason: "too_large" | "unsupported_format" | "decode_failed" | "transcode_failed", detail: string) {
    super(detail);
  }
}

/** Image formats read directly by sharp, and the ones decoded by ImageMagick first. */
const SHARP_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/tiff"]);
const CONVERTED_IMAGES: Record<string, ConvertibleFormat> = { "image/heic": "heic", "image/heif": "heic", "image/heic-sequence": "heic", "image/heif-sequence": "heic", "image/bmp": "bmp" };

type Input = { ownerId: string; kind: MediaKind; file: SpooledBody; maxImagePixels: number; signal?: AbortSignal };

async function imageVariants(store: ObjectStore, prefix: string, input: Input, workDir: string) {
  const type = await fileTypeFromFile(input.file.file);
  const convertible = type ? CONVERTED_IMAGES[type.mime] : undefined;
  if (!type || (!SHARP_IMAGES.has(type.mime) && !convertible)) throw new MediaUnusableError("unsupported_format", type?.mime ?? "unknown");
  const source = convertible ? await convertToPng(input.file.file, convertible, workDir, input.maxImagePixels, input.signal) : input.file.file;
  const img = await processImage(source, workDir, input.maxImagePixels, { animated: true });
  const variants = await storeImageRenditions(store, prefix, workDir, img);
  return { variants, mime: type.mime, width: img.width, height: img.height, durationMs: null };
}

async function audioVariants(store: ObjectStore, prefix: string, input: Input, workDir: string) {
  const audio = await toWebAudio(input.file.file, workDir, input.signal);
  const variants: MediaVariants = await storeAudioFile(store, prefix, audio.file, audio);
  return { variants, mime: audio.mime, width: null, height: null, durationMs: audio.durationMs };
}

/**
 * Stores a fetched NiceNote media for its owner (plan docs/plan/2026-10-24-s2-worker.md §3): the same
 * file already stored for the owner (sha256, also from web uploads) is reused; otherwise images get web
 * renditions (HEIC / BMP decoded first, animation kept) and audio a browser-playable copy.
 * Throws MediaUnusableError for files that can never work; other errors are temporary.
 */
export async function ingestShareMedia(db: Db, store: ObjectStore, input: Input): Promise<Media> {
  const existing = await findMediaByOwnerSha(db, input.ownerId, input.file.sha256);
  if (existing) {
    if (existing.kind !== input.kind) throw new MediaUnusableError("unsupported_format", `stored as ${existing.kind}`);
    return existing;
  }
  const prefix = newMediaPrefix();
  const workDir = path.join(input.file.dir, "out");
  await mkdir(workDir, { recursive: true });
  let stored;
  try {
    stored = input.kind === "image" ? await imageVariants(store, prefix, input, workDir) : await audioVariants(store, prefix, input, workDir);
  } catch (err) {
    if (err instanceof ImageRejectedError || err instanceof AudioUnusableError) throw new MediaUnusableError(err.reason, err.message);
    throw err;
  }
  const { media } = await insertStoredMedia(db, store, { ownerId: input.ownerId, sha256: input.file.sha256, kind: input.kind, ...stored });
  return media;
}
