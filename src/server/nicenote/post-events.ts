import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { enqueueOutbox } from "@/server/db/repos/outbox";

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
