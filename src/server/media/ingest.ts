import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/server/db/client";
import type { Media, MediaVariants } from "@/server/db/schema";
import { findMediaByOwnerSha } from "@/server/db/repos/media";
import { ApiError, badRequest } from "@/server/http/errors";
import type { ObjectStore } from "@/server/storage/types";
import type { SpooledBody } from "@/server/util/temp-file";
import { Semaphore } from "@/server/util/semaphore";
import { probeAudio, AudioRejectedError } from "./audio";
import { detectMediaType } from "./detect";
import { processImage, ImageRejectedError } from "./image";
import { abandonUpload, beginUpload, insertStoredMedia, storeAudioFile, storeImageRenditions } from "./store-media";

export type MediaLimits = {
  maxImageBytes: number;
  maxAudioBytes: number;
  maxAudioSeconds: number;
  maxImagePixels: number;
};

/** Image decoding is CPU/memory heavy: at most two at a time per process. */
const processing = new Semaphore(2);

/**
 * Turns a spooled upload into a stored media row (plan §6, design §4):
 * hash check → dedupe → real type detection → limits → derive renditions
 * (images: metadata stripped) → write to the private store → insert row.
 */
export async function ingestUpload(
  db: Db,
  store: ObjectStore,
  input: { ownerId: string; upload: SpooledBody; declaredSha256: string; limits: MediaLimits },
): Promise<{ media: Media; created: boolean }> {
  const { ownerId, upload, limits } = input;
  if (upload.sha256 !== input.declaredSha256) throw badRequest("media.hash_mismatch");

  const existing = await findMediaByOwnerSha(db, ownerId, upload.sha256);
  if (existing) return { media: existing, created: false };

  const type = await detectMediaType(upload.file);
  if (!type) throw new ApiError("media.unsupported_type", 415);
  const maxBytes = type.kind === "image" ? limits.maxImageBytes : limits.maxAudioBytes;
  if (upload.bytes > maxBytes) throw new ApiError("media.too_large", 413, { maxBytes });

  const workDir = path.join(upload.dir, "out");
  await mkdir(workDir);
  const prefix = await beginUpload(db, ownerId);

  let variants: MediaVariants;
  let dims: { width: number | null; height: number | null; durationMs: number | null };
  try {
    if (type.kind === "image") {
      const img = await processing.run(() => processImage(upload.file, workDir, limits.maxImagePixels));
      variants = await storeImageRenditions(store, prefix, workDir, img);
      dims = { width: img.width, height: img.height, durationMs: null };
    } else {
      const audio = await probeAudio(upload.file, limits.maxAudioSeconds);
      variants = await storeAudioFile(store, prefix, upload.file, { mime: type.mime, ext: type.ext, bytes: upload.bytes });
      dims = { width: null, height: null, durationMs: audio.durationMs };
    }
  } catch (err) {
    await abandonUpload(db, store, prefix);
    if (err instanceof ImageRejectedError || err instanceof AudioRejectedError) {
      throw new ApiError("media.unprocessable", 422, { reason: err.message });
    }
    throw err;
  }
  return insertStoredMedia(db, store, prefix, { ownerId, sha256: upload.sha256, kind: type.kind, mime: type.mime, variants, ...dims });
}
