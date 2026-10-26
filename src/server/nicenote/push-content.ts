import type { Db } from "@/server/db/client";
import type { Post, PostStatus } from "@/server/db/schema";
import { lockPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, insertRevision, linkRevisionMedia, listRevisionMediaIds } from "@/server/db/repos/revisions";
import { contentHash } from "@/server/documents/hash";
import type { SourceDocument } from "@/server/documents/source-schema";
import { ApiError, notFound } from "@/server/http/errors";
import { accountDeleting, lockAuthor, readAuthorState, type AuthorState } from "@/server/accounts/author-gate";
import { finishPublication, NO_PROJECTION, projectMediaPublic, recordPublication, type Projection } from "@/server/media/publication";
import { derivedFields } from "@/server/posts/derived-fields";
import type { MediaStores } from "@/server/storage/types";
import { assertShareOpen, loadShare } from "./manage-share";
import type { PushContentInput } from "./requests";
import { queueMediaEvents } from "./post-events";
import { assertGrants, queueShareMedia, resolveShareMedia, type ResolvedShareMedia } from "./share-media";

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

/**
 * The first push publishes a preparing post. During the account's cooling-off period content is
 * kept but stays offline (`author_deleting`; cancelling the deletion brings it online).
 */
function statusAfterPush(s: PostStatus, author: AuthorState): PostStatus {
  if (author !== "active") return s === "preparing" || s === "active" ? "author_deleting" : s;
  return s === "preparing" ? "active" : s;
}

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
  // Moved ahead of the commit when the post will likely be live (publication.ts); settled after it.
  const rt = { db, stores, cacheControl };
  const goesLive = before.visibility === "public" && statusAfterPush(before.status, await readAuthorState(db, before.author_id)) === "active";
  const projection = goesLive ? await projectMediaPublic(rt, resolved.media) : NO_PROJECTION;
  let touched: string[] = [];
  try {
    const outcome = await commitPush(db, before, input, doc, hash, resolved, projection);
    touched = outcome.touched;
    return { post: outcome.post, changed: outcome.changed };
  } finally {
    await finishPublication(rt, projection, touched);
  }
}

/** `touched`: media to check after the commit (now live, or no longer used by this post). */
type PushOutcome = PushResult & { touched: string[] };

/** The push itself, under the author lock then the post lock (author-gate.ts). */
async function commitPush(db: Db, before: Post, input: PushContentInput, doc: SourceDocument, hash: string, resolved: ResolvedShareMedia, projection: Projection): Promise<PushOutcome> {
  return db.transaction().execute(async (trx): Promise<PushOutcome> => {
    const author = await lockAuthor(trx, before.author_id);
    if (author === "gone") throw accountDeleting();
    const post = await lockPost(trx, before.id);
    if (!post) throw notFound("post.not_found");
    assertPushable(post, input.sourceRevision);
    const unchanged = (p: Post): PushOutcome => ({ post: p, changed: false, touched: [] });
    if (keepsWebEdit(post, input.sourceRevision)) return unchanged(post);
    const prev = post.current_revision_id ? await findRevision(trx, post.current_revision_id) : undefined;
    // The backend learns about media changes from events: ready when complete now; failures when the post
    // became partial or its content changed while partial (failures it was already told about stay quiet).
    const events = (updated: Post, changed: boolean) =>
      queueMediaEvents(trx, updated, { before: post.media_state, failed: changed || post.media_state !== "partial" ? resolved.failed : [] });
    if (prev?.content_hash === hash) {
      const same = post.media_state === resolved.state && Number(post.source_revision) === input.sourceRevision;
      const updated = same ? post : await updatePost(trx, post.id, { media_state: resolved.state, source_revision: input.sourceRevision });
      await events(updated, false);
      return unchanged(updated);
    }
    const status = statusAfterPush(post.status, author);
    const rev = await insertRevision(trx, { postId: post.id, document: doc, contentHash: hash, sourceUpdatedAt: null });
    await linkRevisionMedia(trx, rev.id, resolved.mediaIds);
    // Media this push stopped using (they may have to leave the public store).
    const dropped = prev ? (await listRevisionMediaIds(trx, prev.id)).filter((id) => !resolved.mediaIds.includes(id)) : [];
    const touched = await recordPublication(trx, projection, status === "active" && post.visibility === "public" ? resolved.mediaIds : [], dropped);
    const updated = await updatePost(trx, post.id, {
      ...derivedFields(doc, post, resolved),
      current_revision_id: rev.id,
      source_revision: input.sourceRevision,
      media_state: resolved.state,
      status,
      web_edited: false,
      ...(post.status === "preparing" ? { published_at: new Date() } : {}),
      // A newer cloud revision of published content is an edit (media becoming ready is not).
      ...(prev && post.status !== "preparing" && input.sourceRevision > Number(post.source_revision ?? 0) ? { edited_at: new Date() } : {}),
    });
    await events(updated, true);
    return { post: updated, changed: true, touched };
  });
}
