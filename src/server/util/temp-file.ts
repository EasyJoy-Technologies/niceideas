import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export class BodyTooLargeError extends Error {}

export type SpooledBody = { dir: string; file: string; bytes: number; sha256: string };

/**
 * Streams a request body to a private temp directory while hashing it and
 * enforcing a byte limit (never buffers the whole upload in memory).
 */
export async function spoolBody(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<SpooledBody> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "niceideas-"));
  const file = path.join(dir, randomUUID());
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) return done(new BodyTooLargeError());
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream), meter, createWriteStream(file, { mode: 0o600 }));
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
  return { dir, file, bytes, sha256: hash.digest("hex") };
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
