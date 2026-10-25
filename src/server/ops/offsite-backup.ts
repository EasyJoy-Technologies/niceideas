import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

/** Object-key prefix of database backups in the private bucket (no media key starts with it). */
export const BACKUP_PREFIX = "backups/";
const NAME = /^niceideas-\d{8}T\d{6}Z\.sql\.gz$/;

export type OffsiteResult = { uploaded: string; bytes: number; pruned: string[] };

/**
 * Copies one local database dump to the private bucket under backups/ and deletes backups there
 * older than `keepDays` (by the timestamp in the name; only files named like our dumps).
 */
export async function uploadBackup(client: S3Client, bucket: string, file: string, keepDays: number, now = Date.now()): Promise<OffsiteResult> {
  const name = path.basename(file);
  if (!NAME.test(name)) throw new Error(`not a backup file name: ${name}`);
  const { size } = await stat(file);
  const key = BACKUP_PREFIX + name;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: size, ContentType: "application/gzip" }));

  const cutoff = now - keepDays * 86_400_000;
  const old: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      const n = (o.Key ?? "").slice(BACKUP_PREFIX.length);
      if (NAME.test(n) && backupTime(n) < cutoff) old.push(o.Key!);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  if (old.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: old.map((Key) => ({ Key })), Quiet: true } }));
  return { uploaded: key, bytes: size, pruned: old };
}

/** Time encoded in niceideas-YYYYMMDDTHHMMSSZ.sql.gz. */
export function backupTime(name: string): number {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name)!;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
