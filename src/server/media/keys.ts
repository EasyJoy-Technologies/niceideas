import { getConfig } from "@/server/config/env";
import type { Media, MediaRendition } from "@/server/db/schema";

/** Object key prefix of one upload: random, so public URLs are not enumerable. */
export function mediaPrefix(storageId: string): string {
  return `m/${storageId}`;
}

/** Every object key belonging to a media row. */
export function mediaKeys(media: Pick<Media, "variants">): string[] {
  const v = media.variants;
  return v.kind === "image" ? [...v.webp.map((r) => r.key), v.fallback.key] : [v.original.key];
}

export function renditionsOf(media: Pick<Media, "variants">): MediaRendition[] {
  const v = media.variants;
  return v.kind === "image" ? [...v.webp, v.fallback] : [v.original];
}

export function publicUrl(key: string): string {
  return `${getConfig().MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}
