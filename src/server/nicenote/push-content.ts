import type { Db } from "@/server/db/client";
import type { Post, PostStatus } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, insertRevision, linkRevisionMedia, listRevisionMediaIds } from "@/server/db/repos/revisions";
import { contentHash } from "@/server/documents/hash";
import type { SourceDocument } from "@/server/documents/source-schema";
import { ApiError, notFound } from "@/server/http/errors";
import { projectMediaPublic, recordMediaPublic, withdrawUnreferencedMedia } from "@/server/media/publication";
import { derivedFields } from "@/server/posts/derived-fields";
import type { MediaStores } from "@/server/storage/types";
import { assertShareOpen, loadShare } from "./manage-share";
import type { PushContentInput } from "./requests";
import { queueMediaEvents } from "./post-events";
import { assertGrants, queueShareMedia, resolveShareMedia } from "./share-media";

export type PushResult = { post: Post; changed: boolean };

/** After a web edit, an update of the same cloud revision (a backend retry) leaves the web edit in place. */
const keepsWebEdit = (post: Post, sourceRevision: number) => post.web_edited && post.source_revision !== null && sourceRevision <= Number(post.source_revision);

/**
 * Refuses pushes that cannot apply (re-checked under the row lock): offline posts, frozen posts
 * that already have content, and older cloud revisions (409 `post.stale_update`). The same
 * revision with other content is accepted (e.g. a media block became ready).
 */
function assertPushable(post: Post, sourceRevision: number): void {
  assertShareOpen(post);
  if (post.sync_mode === "frozen" && post.current_revision_id) throw new ApiError("post.frozen", 409);
  const current = post.source_revision === null ? null : Number(post.source_revision);
  if (current !== null && sourceRevision < current) throw new ApiError("post.stale_update", 409, { current });
}

/** The first push publishes a preparing post; an account being deleted keeps its posts offline. */
const statusAfterPush = (s: PostStatus): PostStatus => (s === "preparing" ? "active" : s);

/**
 * PUT /posts/{id}/content (contract niceideas-share.md §3.3): same content → `changed: false`
 * (only media progress may change); otherwise a new revision is switched in atomically, the link
 * stays the same. Media not stored yet are fetched by the worker; their blocks show placeholders.
 */
export async function pushShareContent(db: Db, stores: MediaStores, cacheControl: string, postId: string, input: PushContentInput): Promise<PushResult> {
  const before = await loadShare(db, postId);
  assertPushable(before, input.sourceRevision);
  if (keepsWebEdit(before, input.sourceRevision)) return { post: before, changed: false };
  assertGrants(input.media);
  const doc: SourceDocument = { ...input.document, origin: "nicenote" };
  const hash = contentHash(doc);
  await queueShareMedia(db, before.author_id, doc, input.media);
  const resolved = await resolveShareMedia(db, before.author_id, doc);
  const goesLive = statusAfterPush(before.status) === "active";
  if (goesLive) await projectMediaPublic(stores, resolved.media, cacheControl);

  const outcome = await db.transaction().execute(async (trx) => {
    const post = await lockPost(trx, before.id);
    if (!post) throw notFound("post.not_found");
    assertPushable(post, input.sourceRevision);
    if (keepsWebEdit(post, input.sourceRevision)) return { post, changed: false, previousMedia: [] as string[] };
    const prev = post.current_revision_id ? await findRevision(trx, post.current_revision_id) : undefined;
    // The backend learns about media changes from events: ready when complete now; failures when the post
    // became partial or its content changed while partial (failures it was already told about stay quiet).
    const events = (updated: Post, changed: boolean) =>
      queueMediaEvents(trx, updated, { before: post.media_state, failed: changed || post.media_state !== "partial" ? resolved.failed : [] });
    if (prev?.content_hash === hash) {
      const same = post.media_state === resolved.state && Number(post.source_revision) === input.sourceRevision;
      const updated = same ? post : await updatePost(trx, post.id, { media_state: resolved.state, source_revision: input.sourceRevision });
      await events(updated, false);
      return { post: updated, changed: false, previousMedia: [] as string[] };
    }
    const rev = await insertRevision(trx, { postId: post.id, document: doc, contentHash: hash, sourceUpdatedAt: null });
    await linkRevisionMedia(trx, rev.id, resolved.mediaIds);
    if (goesLive) await recordMediaPublic(trx, resolved.mediaIds);
    const updated = await updatePost(trx, post.id, {
      ...derivedFields(doc, post, resolved),
      current_revision_id: rev.id,
      source_revision: input.sourceRevision,
      media_state: resolved.state,
      status: statusAfterPush(post.status),
      web_edited: false,
      ...(post.status === "preparing" ? { published_at: new Date() } : {}),
      // A newer cloud revision of published content is an edit (media becoming ready is not).
      ...(prev && post.status !== "preparing" && input.sourceRevision > Number(post.source_revision ?? 0) ? { edited_at: new Date() } : {}),
    });
    await events(updated, true);
    const previousMedia = prev ? await listRevisionMediaIds(trx, prev.id) : [];
    return { post: updated, changed: true, previousMedia };
  });

  // Media dropped by this push leave the public bucket (failures are retried by reconciliation).
  const dropped = outcome.previousMedia.filter((id) => !resolved.mediaIds.includes(id));
  await withdrawUnreferencedMedia(db, stores, dropped).catch((e) => console.error("[nicenote] media withdrawal failed", outcome.post.id, e));
  return { post: outcome.post, changed: outcome.changed };
}
