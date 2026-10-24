import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/server/db/client";
import type { Media, MediaRendition, MediaVariants } from "@/server/db/schema";
import { findMediaByOwnerSha, insertMediaOrGet } from "@/server/db/repos/media";
import { ApiError, badRequest } from "@/server/http/errors";
import type { ObjectStore } from "@/server/storage/types";
import type { SpooledBody } from "@/server/util/temp-file";
import { Semaphore } from "@/server/util/semaphore";
import { probeAudio, AudioRejectedError } from "./audio";
import { detectMediaType } from "./detect";
import { processImage, ImageRejectedError } from "./image";
import { mediaPrefix } from "./keys";

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

  const prefix = mediaPrefix(randomUUID());
  const workDir = path.join(upload.dir, "out");
  await mkdir(workDir);

  let variants: MediaVariants;
  let dims: { width: number | null; height: number | null; duration_ms: number | null };
  try {
    if (type.kind === "image") {
      const img = await processing.run(() => processImage(upload.file, workDir, limits.maxImagePixels));
      const withKey = (r: MediaRendition): MediaRendition => ({ ...r, key: `${prefix}/${r.key}` });
      variants = { kind: "image", webp: img.webp.map(withKey), fallback: withKey(img.fallback) };
      dims = { width: img.width, height: img.height, duration_ms: null };
      await Promise.all(
        [...img.webp, img.fallback].map((r) => store.putFile(`${prefix}/${r.key}`, path.join(workDir, r.key), { contentType: r.mime })),
      );
    } else {
      const audio = await probeAudio(upload.file, limits.maxAudioSeconds);
      const original: MediaRendition = { key: `${prefix}/audio.${type.ext}`, mime: type.mime, bytes: upload.bytes };
      variants = { kind: "audio", original };
      dims = { width: null, height: null, duration_ms: audio.durationMs };
      await store.putFile(original.key, upload.file, { contentType: type.mime });
    }
  } catch (err) {
    if (err instanceof ImageRejectedError || err instanceof AudioRejectedError) {
      throw new ApiError("media.unprocessable", 422, { reason: err.message });
    }
    throw err;
  }

  const storedBytes = variants.kind === "image" ? [...variants.webp, variants.fallback].reduce((n, r) => n + r.bytes, 0) : upload.bytes;
  const result = await insertMediaOrGet(db, {
    owner_id: ownerId,
    sha256: upload.sha256,
    kind: type.kind,
    mime: type.mime,
    byte_size: storedBytes,
    ...dims,
    variants: JSON.stringify(variants),
  });
  if (!result.created) {
    // A concurrent identical upload won the race; drop our copies.
    const keys = variants.kind === "image" ? [...variants.webp, variants.fallback].map((r) => r.key) : [variants.original.key];
    await store.deleteMany(keys).catch((e) => console.error("[media] orphan cleanup failed", prefix, e));
  }
  return result;
}
