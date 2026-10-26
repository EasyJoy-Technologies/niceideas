import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertSafeKey, ObjectMissingError, RangeNotSatisfiableError, type ObjectRead, type ObjectStore, type PutOptions } from "./types";

/** S3-compatible store (Cloudflare R2). */
export class S3Store implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    readonly bucket: string,
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

  async read(key: string, range: string | null): Promise<ObjectRead> {
    assertSafeKey(key);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range ?? undefined }));
      if (!out.Body) throw new Error(`empty body for ${key}`);
      return { body: out.Body as Readable, contentLength: out.ContentLength ?? 0, contentRange: range ? (out.ContentRange ?? null) : null };
    } catch (err) {
      if (notFound(err)) throw new ObjectMissingError(key);
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e?.name === "InvalidRange" || e?.$metadata?.httpStatusCode === 416) throw new RangeNotSatisfiableError(null);
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (notFound(err)) return false;
      throw err;
    }
  }

  async copyTo(target: ObjectStore, key: string, options: PutOptions): Promise<void> {
    assertSafeKey(key);
    if (!(target instanceof S3Store)) throw new Error("copyTo needs a store of the same kind");
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: target.bucket,
          Key: key,
          CopySource: `${this.bucket}/${key}`,
          MetadataDirective: "REPLACE",
          ContentType: options.contentType,
          CacheControl: options.cacheControl,
        }),
      );
    } catch (err) {
      if (notFound(err)) throw new ObjectMissingError(key);
      throw err;
    }
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

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
}

const notFound = (err: unknown) => {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
};

export function createS3Client(endpoint: string, region: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true });
}

