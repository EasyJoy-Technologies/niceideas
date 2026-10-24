import type { Db } from "@/server/db/client";
import { findPostById, listSharesUsingRef, lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, linkRevisionMedia, listRevisionMediaIds } from "@/server/db/repos/revisions";
import { isSourceDocument, type StoredDocument } from "@/server/documents/stored";
import { projectMediaPublic, recordMediaPublic } from "@/server/media/publication";
import { derivedFields } from "@/server/posts/derived-fields";
import type { MediaStores } from "@/server/storage/types";
import { queueMediaEvents } from "./post-events";
import { resolveShareMedia, type FailedRef } from "./share-media";

export type ShareMediaRuntime = { db: Db; stores: MediaStores; cacheControl: string };

/**
 * Brings a share up to date with its media as stored now (after the worker stored or gave up on
 * one): links the media of its current content, publishes them when the post is live, recomputes
 * the cover and media state (the page shows the change on the next request), and tells the backend
 * (`media_ready` when complete; `media_failed` for the given refs if they failed).
 * When a push switches the content meanwhile, the new content is brought up to date instead
 * (that push may have seen the media still in progress).
 */
export async function refreshShareMedia(rt: ShareMediaRuntime, postId: string, reportFailed: FailedRef[]): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await refreshOnce(rt, postId, reportFailed)) !== "content_changed") return;
  }
  console.warn(JSON.stringify({ event: "share_media_refresh", postId, result: "content_kept_changing" }));
}

async function refreshOnce(rt: ShareMediaRuntime, postId: string, reportFailed: FailedRef[]): Promise<"done" | "content_changed"> {
  const post = await findPostById(rt.db, postId);
  if (!post?.current_revision_id) return "done";
  const rev = await findRevision(rt.db, post.current_revision_id);
  const doc = rev?.document as StoredDocument | undefined;
  if (!rev || !doc || !isSourceDocument(doc)) return "done";
  const resolved = await resolveShareMedia(rt.db, post.author_id, doc);
  const linked = new Set(await listRevisionMediaIds(rt.db, rev.id));
  const added = resolved.media.filter((m) => !linked.has(m.id));
  if (post.status === "active") await projectMediaPublic(rt.stores, added, rt.cacheControl);

  return rt.db.transaction().execute(async (trx) => {
    const locked = await lockPost(trx, postId);
    if (!locked) return "done";
    if (locked.current_revision_id !== rev.id) return "content_changed";
    await linkRevisionMedia(trx, rev.id, added.map((m) => m.id));
    // Copies were made only for a live post; one taken offline meanwhile keeps them private (reconciliation removes strays).
    if (locked.status === "active" && post.status === "active") await recordMediaPublic(trx, added.map((m) => m.id));
    const updated = await updatePost(trx, postId, { ...derivedFields(doc, locked, resolved), media_state: resolved.state });
    const failed = resolved.failed.filter((f) => reportFailed.some((r) => r.ref === f.ref));
    await queueMediaEvents(trx, updated, { before: locked.media_state, failed });
    return "done";
  });
}

/** Refreshes every share of the owner whose current content uses `ref`. */
export async function applyRefToShares(rt: ShareMediaRuntime, ownerId: string, ref: string, failure?: FailedRef): Promise<number> {
  const ids = await listSharesUsingRef(rt.db, ownerId, ref);
  for (const id of ids) await refreshShareMedia(rt, id, failure ? [failure] : []);
  return ids.length;
}
