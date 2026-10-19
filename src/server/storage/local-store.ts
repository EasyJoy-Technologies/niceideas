import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { assertSafeKey, type ObjectStore } from "./types";

/** Filesystem store for development and tests (content type / cache headers are not persisted). */
export class LocalStore implements ObjectStore {
  constructor(private readonly root: string) {}

  resolve(key: string): string {
    assertSafeKey(key);
    return path.join(this.root, key);
  }

  async putFile(key: string, filePath: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(filePath, target);
  }

  async putBuffer(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async putStream(key: string, body: Readable): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await pipeline(body, createWriteStream(target));
  }

  async getStream(key: string): Promise<Readable> {
    const target = this.resolve(key);
    const stream = createReadStream(target);
    await new Promise<void>((resolve, reject) => {
      stream.once("open", () => resolve());
      stream.once("error", reject);
    });
    return stream;
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => rm(this.resolve(k), { force: true })));
  }
}
