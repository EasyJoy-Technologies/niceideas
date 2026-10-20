import sharp from "sharp";
import type { Media } from "@/server/db/schema";
import type { ObjectStore } from "@/server/storage/types";
import { Semaphore } from "@/server/util/semaphore";

export const OG_VARIANTS = { "wide.jpg": { width: 1200, height: 630 }, "square.jpg": { width: 600, height: 600 } } as const;
export type OgVariant = keyof typeof OG_VARIANTS;

/** WhatsApp ignores preview images above ~300 KB. */
const MAX_BYTES = 300 * 1024;
const QUALITIES = [82, 72, 62, 50];
const CACHE_ENTRIES = 64;

const rendering = new Semaphore(2);
const cache = new Map<string, Buffer>();

async function readAll(store: ObjectStore, key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await store.getStream(key)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Crops the cover into a share image (attention-based crop, JPEG ≤ 300 KB).
 * `cacheKey` must change whenever the cover changes; results are kept in a
 * small in-process LRU so crawler bursts do not re-encode.
 */
export async function renderOgImage(store: ObjectStore, cover: Media, variant: OgVariant, cacheKey: string): Promise<Buffer> {
  const hit = cache.get(cacheKey);
  if (hit) {
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit;
  }
  if (cover.variants.kind !== "image") throw new Error("cover is not an image");
  const source = await readAll(store, cover.variants.fallback.key);
  const { width, height } = OG_VARIANTS[variant];
  const out = await rendering.run(async () => {
    const resized = sharp(source).resize(width, height, { fit: "cover", position: sharp.strategy.attention }).flatten({ background: "#ffffff" });
    let last: Buffer = Buffer.alloc(0);
    for (const quality of QUALITIES) {
      last = await resized.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
      if (last.length <= MAX_BYTES) break;
    }
    return last;
  });
  cache.set(cacheKey, out);
  if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return out;
}
