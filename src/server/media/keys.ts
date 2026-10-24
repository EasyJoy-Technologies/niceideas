import { getConfig } from "@/server/config/env";
import type { Media, MediaRendition } from "@/server/db/schema";

/** Object key prefix of one upload: random, so public URLs are not enumerable. */
export function mediaPrefix(storageId: string): string {
  return `m/${storageId}`;
}

/** Every stored rendition of a media row (storage, publication, deletion and size all use this list). */
export function renditionsOf(media: Pick<Media, "variants">): MediaRendition[] {
  const v = media.variants;
  return v.kind === "image" ? [...v.webp, v.fallback, ...(v.large ? [v.large] : [])] : [v.original];
}

/** Every object key belonging to a media row. */
export function mediaKeys(media: Pick<Media, "variants">): string[] {
  return renditionsOf(media).map((r) => r.key);
}

export function publicUrl(key: string): string {
  return `${getConfig().MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}
