import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/client";
import type { MediaState, Post } from "@/server/db/schema";
import { enqueueOutbox } from "@/server/db/repos/outbox";
import type { FailedRef } from "./share-media";

export type SharePostEvent = "unpublished" | "removed" | "restored" | "media_failed" | "media_ready";

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
 * Media events of a live share (contract §4.2): `media_ready` when its media became complete,
 * one `media_failed` per reason for the given failed refs. Call in the transaction that updated the post.
 */
export async function queueMediaEvents(db: Db, post: Pick<Post, "id" | "source" | "share_id" | "status" | "media_state">, opts: { before: MediaState; failed: FailedRef[] }): Promise<void> {
  if (post.status !== "active") return;
  if (post.media_state === "complete" && opts.before !== "complete") await queuePostEvent(db, post, "media_ready");
  const byReason = new Map<string, string[]>();
  for (const f of opts.failed) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.ref]);
  for (const [reason, refs] of byReason) await queuePostEvent(db, post, "media_failed", { refs, reason });
}
