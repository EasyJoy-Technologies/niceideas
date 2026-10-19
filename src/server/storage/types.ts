import type { Readable } from "node:stream";

export type PutOptions = { contentType: string; cacheControl?: string };

/** Minimal object store used for media (local filesystem or S3-compatible). */
export interface ObjectStore {
  putFile(key: string, filePath: string, options: PutOptions): Promise<void>;
  putBuffer(key: string, body: Buffer, options: PutOptions): Promise<void>;
  putStream(key: string, body: Readable, options: PutOptions & { contentLength: number }): Promise<void>;
  getStream(key: string): Promise<Readable>;
  /** Deletes keys; missing keys are not an error. */
  deleteMany(keys: string[]): Promise<void>;
}

export type MediaStores = {
  /** Every rendition of every upload. Never publicly reachable. */
  privateStore: ObjectStore;
  /** Only media of live posts; exposed at MEDIA_PUBLIC_BASE_URL. */
  publicStore: ObjectStore;
};

/** Object keys are generated server-side; still validated defensively. */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,200}$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`unsafe object key: ${key}`);
  }
}
