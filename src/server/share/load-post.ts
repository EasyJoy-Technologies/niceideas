import type { Db } from "@/server/db/client";
import type { Post, PostRevision, Profile } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { findProfile } from "@/server/db/repos/profiles";
import { findRevision } from "@/server/db/repos/revisions";
import { parseStoredDocument, type StoredDocument } from "@/server/documents/stored";
import { SLUG_PATTERN } from "@/server/posts/slug";
import { loadDocumentMedia, type DocumentMedia } from "./document-media";

export type SharePost = DocumentMedia & {
  post: Post;
  author: Profile;
  revision: PostRevision;
  document: StoredDocument;
};

export type ShareLoad =
  | { state: "not_found" }
  | { state: "gone"; reason: "withdrawn" | "removed" }
  | { state: "preparing"; post: Post; author: Profile }
  | { state: "ok"; data: SharePost };

/** Active posts are shown; a just-shared post is `preparing`; everything else is gone (410) until purged (then 404). */
export async function loadSharePost(db: Db, slug: string): Promise<ShareLoad> {
  if (!SLUG_PATTERN.test(slug)) return { state: "not_found" };
  const post = await findPostBySlug(db, slug);
  if (!post) return { state: "not_found" };
  if (post.status !== "active" && post.status !== "preparing") return { state: "gone", reason: post.status === "removed" ? "removed" : "withdrawn" };
  // post.author_id references profile (FK); a missing row means the account is being deleted.
  const author = await findProfile(db, post.author_id);
  if (!author) return { state: "not_found" };
  if (post.status === "preparing") return { state: "preparing", post, author };
  const revision = post.current_revision_id ? await findRevision(db, post.current_revision_id) : undefined;
  if (!revision) return { state: "not_found" };
  // Stored documents were validated on write; a parse failure here is a server bug (500).
  const document = parseStoredDocument(revision.document);
  return { state: "ok", data: { post, author, revision, document, ...(await loadDocumentMedia(db, post.author_id, document)) } };
}
