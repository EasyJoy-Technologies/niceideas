import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Db } from "@/server/db/client";
import type { Media, MediaKind, MediaRendition, MediaVariants } from "@/server/db/schema";
import { insertMediaOrGet } from "@/server/db/repos/media";
import type { ObjectStore } from "@/server/storage/types";
import type { ProcessedImage } from "./image";
import { mediaKeys, mediaPrefix, renditionsOf } from "./keys";

/** Object key prefix of a new stored media (random, so public URLs are not enumerable). */
export const newMediaPrefix = () => mediaPrefix(randomUUID());

/** Uploads image renditions from `workDir` to the private store under `prefix`. */
export async function storeImageRenditions(store: ObjectStore, prefix: string, workDir: string, img: ProcessedImage): Promise<MediaVariants> {
  const withKey = (r: MediaRendition): MediaRendition => ({ ...r, key: `${prefix}/${r.key}` });
  const all = [...img.webp, img.fallback, ...(img.large ? [img.large] : [])];
  await Promise.all(all.map((r) => store.putFile(`${prefix}/${r.key}`, path.join(workDir, r.key), { contentType: r.mime })));
  return { kind: "image", webp: img.webp.map(withKey), fallback: withKey(img.fallback), ...(img.large ? { large: withKey(img.large) } : {}) };
}

/** Uploads one audio file to the private store under `prefix`. */
export async function storeAudioFile(store: ObjectStore, prefix: string, file: string, a: { mime: string; ext: string; bytes: number }): Promise<MediaVariants> {
  const original: MediaRendition = { key: `${prefix}/audio.${a.ext}`, mime: a.mime, bytes: a.bytes };
  await store.putFile(original.key, file, { contentType: a.mime });
  return { kind: "audio", original };
}

/**
 * Inserts the media row for stored renditions. When the same file (owner + sha256) was stored
 * concurrently, the existing row wins and our copies are removed.
 */
export async function insertStoredMedia(
  db: Db,
  store: ObjectStore,
  row: { ownerId: string; sha256: string; kind: MediaKind; mime: string; variants: MediaVariants; width: number | null; height: number | null; durationMs: number | null },
): Promise<{ media: Media; created: boolean }> {
  const renditions = renditionsOf({ variants: row.variants });
  const result = await insertMediaOrGet(db, {
    owner_id: row.ownerId,
    sha256: row.sha256,
    kind: row.kind,
    mime: row.mime,
    byte_size: renditions.reduce((n, r) => n + r.bytes, 0),
    width: row.width,
    height: row.height,
    duration_ms: row.durationMs,
    variants: JSON.stringify(row.variants),
  });
  if (!result.created) {
    const keys = mediaKeys({ variants: row.variants });
    await store.deleteMany(keys).catch((e) => console.error("[media] orphan cleanup failed", keys[0], e));
  }
  return result;
}
