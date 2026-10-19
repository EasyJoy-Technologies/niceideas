import path from "node:path";
import { getConfig } from "@/server/config/env";
import { LocalStore } from "./local-store";
import { createS3Client, S3Store } from "./s3-store";
import type { MediaStores } from "./types";

let stores: MediaStores | null = null;

export function getMediaStores(): MediaStores {
  if (!stores) {
    const cfg = getConfig();
    if (cfg.STORAGE_DRIVER === "s3") {
      const client = createS3Client(cfg.S3_ENDPOINT!, cfg.S3_REGION, cfg.S3_ACCESS_KEY_ID!, cfg.S3_SECRET_ACCESS_KEY!);
      stores = { privateStore: new S3Store(client, cfg.S3_PRIVATE_BUCKET!), publicStore: new S3Store(client, cfg.S3_PUBLIC_BUCKET!) };
    } else {
      const root = path.resolve(cfg.LOCAL_STORAGE_DIR);
      stores = { privateStore: new LocalStore(path.join(root, "private")), publicStore: new LocalStore(path.join(root, "public")) };
    }
  }
  return stores;
}

/** Test hook. */
export function setMediaStoresForTests(next: MediaStores | null): void {
  stores = next;
}
