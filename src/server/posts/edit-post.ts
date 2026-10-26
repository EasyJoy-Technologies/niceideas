import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { findRevision } from "@/server/db/repos/revisions";
import { parseStoredDocument, type StoredDocument } from "@/server/documents/stored";
import { ApiError, notFound } from "@/server/http/errors";
import { loadDocumentMedia } from "@/server/share/document-media";
import type { MediaStores } from "@/server/storage/types";
import { editPrefill, type EditPrefill } from "./edit-source";
import { switchRevision } from "./switch-revision";
import { draftDocument, type WebComposeInput } from "./web-compose";
import type { DraftMeta } from "./web-compose-doc";

/** Why a post cannot be edited now, or null. Only live posts, and NiceNote shares whose media are all processed. */
export type EditBlocker = "not_active" | "processing";
export function editBlocker(post: Pick<Post, "status" | "media_state">): EditBlocker | null {
  if (post.status !== "active") return "not_active";
  return post.media_state === "processing" ? "processing" : null;
}

/** The viewer's own post by slug; other users' posts look nonexistent (404). */
async function loadOwn(db: Db, userId: string, slug: string): Promise<Post> {
  const post = await findPostBySlug(db, slug);
  if (!post || post.author_id !== userId) throw notFound("post.not_found");
  return post;
}

async function currentDocument(db: Db, post: Post): Promise<StoredDocument | null> {
  const rev = post.current_revision_id ? await findRevision(db, post.current_revision_id) : undefined;
  return rev ? parseStoredDocument(rev.document) : null;
}

export type EditLoad = { post: Post; prefill: EditPrefill | null; blocker: EditBlocker | null };

/** Edit page data: the post, and its content prepared for the editor when it can be edited. */
export async function loadPostForEdit(db: Db, userId: string, slug: string): Promise<EditLoad> {
  const post = await loadOwn(db, userId, slug);
  const blocker = editBlocker(post);
  const doc = blocker ? null : await currentDocument(db, post);
  if (!doc) return { post, prefill: null, blocker: blocker ?? "not_active" };
  const { media } = await loadDocumentMedia(db, post.author_id, doc);
  return { post, prefill: editPrefill(post, doc, media), blocker: null };
}

/** Details of the stored media in the current document, by media id (the no-JS form does not send them). */
async function currentMeta(db: Db, post: Post): Promise<Map<string, DraftMeta>> {
  const doc = await currentDocument(db, post);
  if (!doc) return new Map();
  const { media } = await loadDocumentMedia(db, post.author_id, doc);
  const out = new Map<string, DraftMeta>();
  for (const b of doc.blocks) {
    if (b.type !== "image" && b.type !== "audio") continue;
    const key = "mediaId" in b ? b.mediaId : b.state === "ready" ? b.ref : null;
    const m = key ? media.get(key) : undefined;
    if (m) out.set(m.id, { alt: "alt" in b ? b.alt : undefined, caption: "caption" in b ? b.caption : undefined, title: "title" in b ? b.title : undefined });
  }
  return out;
}

const assertEditable = (post: Post) => {
  const blocker = editBlocker(post);
  if (blocker) throw new ApiError("post.not_editable", 409, { reason: blocker });
  return true;
};

/**
 * Saves a web edit (plan docs/plan/2026-10-26-web-edit.md): the post keeps its type and link; a new
 * revision replaces the content (any source). Marks it edited, and edited on the web so an app
 * retry of the same version does not undo it.
 */
export async function saveWebEdit(db: Db, stores: MediaStores, userId: string, slug: string, input: WebComposeInput, cacheControl: string): Promise<Post> {
  const post = await loadOwn(db, userId, slug);
  assertEditable(post);
  const mode = post.kind === "short" ? "short" : "long";
  const meta = await currentMeta(db, post);
  // Short posts have no title: one they carried was in the editor as the bold first line.
  const document = await draftDocument(db, stores, userId, { ...input, mode, title: mode === "long" ? input.title : "" }, (id) => meta.get(id) ?? {});
  const result = await switchRevision(db, stores, userId, post, document, {
    cacheControl,
    sourceUpdatedAt: post.source_updated_at,
    check: assertEditable,
    extra: (p) => ({ kind: p.kind, edited_at: new Date(), web_edited: true, media_state: "complete" }),
  });
  return result.post;
}
