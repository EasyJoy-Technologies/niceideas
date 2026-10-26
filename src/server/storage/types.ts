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
  /** Keys starting with `prefix` (all pages). */
  listKeys(prefix: string): Promise<string[]>;
  exists(key: string): Promise<boolean>;
  /**
   * Copies `key` into `target` (a store of the same kind) without passing the bytes through this
   * process; headers are replaced by `options`. Throws ObjectMissingError when the key is absent.
   */
  copyTo(target: ObjectStore, key: string, options: PutOptions): Promise<void>;
}

export class ObjectMissingError extends Error {
  constructor(key: string) {
    super(`object not found: ${key}`);
  }
}

export type MediaStores = {
  /** Renditions of media not (or no longer) shown publicly. Never publicly reachable. */
  privateStore: ObjectStore;
  /** Media of live posts, moved here from the private store (one copy per file); exposed at MEDIA_PUBLIC_BASE_URL. */
  publicStore: ObjectStore;
};

/** Object keys are generated server-side; still validated defensively. */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,200}$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`unsafe object key: ${key}`);
  }
}
