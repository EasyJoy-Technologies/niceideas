import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Db } from "@/server/db/client";
import type { Media, MediaKind, MediaRendition, MediaVariants } from "@/server/db/schema";
import { accountDeleting, lockAuthor } from "@/server/accounts/author-gate";
import { insertMediaOrGet } from "@/server/db/repos/media";
import { dropUpload, recordUpload } from "@/server/db/repos/media-uploads";
import type { ObjectStore } from "@/server/storage/types";
import type { ProcessedImage } from "./image";
import { mediaKeys, mediaPrefix, renditionsOf } from "./keys";

/**
 * Starts storing a new media for `ownerId`: a random key prefix (public URLs are not enumerable),
 * recorded before the first object is written so leftovers of a failed upload are found and removed
 * (maintenance, account deletion). 409 `user.deleting` when the owner no longer exists.
 */
export async function beginUpload(db: Db, ownerId: string): Promise<string> {
  const prefix = mediaPrefix(randomUUID());
  try {
    await recordUpload(db, prefix, ownerId);
  } catch (err) {
    if ((err as { code?: string }).code === "23503") throw accountDeleting();
    throw err;
  }
  return prefix;
}

/** Removes what a failed upload stored (best effort; maintenance retries what is left). */
export async function abandonUpload(db: Db, store: ObjectStore, prefix: string): Promise<void> {
  try {
    await store.deleteMany(await store.listKeys(`${prefix}/`));
    await dropUpload(db, prefix);
  } catch (e) {
    console.error("[media] upload cleanup failed", prefix, e);
  }
}

/** Uploads image renditions from `workDir` to the private store under `prefix`. */
export async function storeImageRenditions(store: ObjectStore, prefix: string, workDir: string, img: ProcessedImage): Promise<MediaVariants> {
  const withKey = (r: MediaRendition): MediaRendition => ({ ...r, key: `${prefix}/${r.key}` });
  const all = [...img.webp, img.fallback, ...(img.large ? [img.large] : [])];
  // Every write finishes (or fails) before an error is raised, so a cleanup sees all the objects.
  const results = await Promise.allSettled(all.map((r) => store.putFile(`${prefix}/${r.key}`, path.join(workDir, r.key), { contentType: r.mime })));
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
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
 * concurrently, the existing row wins and our copies are removed. An owner whose deletion completed
 * (or is running) gets nothing stored: the copies are removed and 409 `user.deleting` is thrown.
 */
export async function insertStoredMedia(
  db: Db,
  store: ObjectStore,
  prefix: string,
  row: { ownerId: string; sha256: string; kind: MediaKind; mime: string; variants: MediaVariants; width: number | null; height: number | null; durationMs: number | null },
): Promise<{ media: Media; created: boolean }> {
  const renditions = renditionsOf({ variants: row.variants });
  const keys = mediaKeys({ variants: row.variants });
  // Under the owner lock (author-gate.ts): the account deletion lists the owner's media after its fence.
  let rolledBack = false;
  const result = await db
    .transaction()
    .execute(async (trx) => {
      try {
        if ((await lockAuthor(trx, row.ownerId)) === "gone") return null;
        await dropUpload(trx, prefix);
        return await insertMediaOrGet(trx, {
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
      } catch (err) {
        rolledBack = true;
        throw err;
      }
    })
    .catch(async (err: unknown) => {
      // Failed before the commit (certainly rolled back): the objects go now. A failed commit is left
      // to the maintenance (the upload record tells whether the row exists).
      if (rolledBack) await abandonUpload(db, store, prefix);
      throw err;
    });
  if (!result?.created) await store.deleteMany(keys).catch((e) => console.error("[media] orphan cleanup failed", keys[0], e));
  if (!result) {
    await dropUpload(db, prefix).catch(() => undefined);
    throw accountDeleting();
  }
  return result;
}
