import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertSafeKey, type ObjectStore, type PutOptions } from "./types";

/** S3-compatible store (Cloudflare R2). */
export class S3Store implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async putFile(key: string, filePath: string, options: PutOptions): Promise<void> {
    assertSafeKey(key);
    const { size } = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async putBuffer(key: string, body: Buffer, options: PutOptions): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: options.contentType, CacheControl: options.cacheControl }),
    );
  }

  async putStream(key: string, body: Readable, options: PutOptions & { contentLength: number }): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: options.contentLength,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    assertSafeKey(key);
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) throw new Error(`empty body for ${key}`);
    return out.Body as Readable;
  }

  async deleteMany(keys: string[]): Promise<void> {
    keys.forEach(assertSafeKey);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      const res = await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
      );
      if (res.Errors?.length) throw new Error(`delete failed for ${res.Errors.length} objects in ${this.bucket}`);
    }
  }
}

export function createS3Client(endpoint: string, region: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true });
}

