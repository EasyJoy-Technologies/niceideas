import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/client";
import type { MediaState, Post } from "@/server/db/schema";
import { enqueueOutbox } from "@/server/db/repos/outbox";
import type { FailedRef } from "./share-media";

export type SharePostEvent = "unpublished" | "removed" | "restored" | "media_failed" | "media_ready" | "visibility_changed";

/**
 * Queues a post status event for the NiceMatrix backend (contract niceideas-share.md §4.2),
 * delivered with retries by the worker. Only NiceNote shares have a backend counterpart.
 */
export async function queuePostEvent(db: Db, post: Pick<Post, "id" | "source" | "share_id">, event: SharePostEvent, details?: Record<string, unknown>): Promise<void> {
  if (post.source !== "nicenote" || !post.share_id) return;
  const eventId = randomUUID();
  await enqueueOutbox(db, {
    kind: "post_event",
    dedupeKey: `post_event:${eventId}`,
    payload: { eventId, postId: post.id, shareId: post.share_id, event, occurredAt: new Date().toISOString(), ...(details ? { details } : {}) },
  });
}

/**
 * Largest serialized event (bytes): the backend accepts 8 KiB per request (API 1.2.745; 64 KiB from
 * 1.2.750); the rest is room for the envelope fields.
 */
const MAX_EVENT_BYTES = 7000;
const PAYLOAD_ENVELOPE_BYTES = 400;

/** Splits refs into groups whose `media_failed` payload stays within MAX_EVENT_BYTES (F15). */
export function chunkRefs(refs: string[], reason: string): string[][] {
  const budget = MAX_EVENT_BYTES - PAYLOAD_ENVELOPE_BYTES - Buffer.byteLength(JSON.stringify(reason));
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 2;
  for (const ref of refs) {
    const bytes = Buffer.byteLength(JSON.stringify(ref)) + 1;
    if (current.length && size + bytes > budget) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(ref);
    size += bytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Media events of a live share (contract §4.2): `media_ready` when its media became complete,
 * `media_failed` per reason for the given failed refs (several events when the refs would not fit
 * one request). Call in the transaction that updated the post.
 */
export async function queueMediaEvents(db: Db, post: Pick<Post, "id" | "source" | "share_id" | "status" | "media_state">, opts: { before: MediaState; failed: FailedRef[] }): Promise<void> {
  if (post.status !== "active") return;
  if (post.media_state === "complete" && opts.before !== "complete") await queuePostEvent(db, post, "media_ready");
  const byReason = new Map<string, string[]>();
  for (const f of opts.failed) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.ref]);
  for (const [reason, refs] of byReason) for (const chunk of chunkRefs(refs, reason)) await queuePostEvent(db, post, "media_failed", { refs: chunk, reason });
}
