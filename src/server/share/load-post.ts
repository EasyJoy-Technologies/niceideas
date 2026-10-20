import type { Db } from "@/server/db/client";
import type { Media, Post, PostRevision, Profile } from "@/server/db/schema";
import { findMediaByIds } from "@/server/db/repos/media";
import { findPostBySlug } from "@/server/db/repos/posts";
import { findProfile } from "@/server/db/repos/profiles";
import { findRevision } from "@/server/db/repos/revisions";
import { documentSchema, type PostDocument } from "@/server/documents/schema";
import { documentMediaIds } from "@/server/documents/validate";
import { SLUG_PATTERN } from "@/server/posts/slug";

export type SharePost = {
  post: Post;
  author: Profile;
  revision: PostRevision;
  document: PostDocument;
  media: ReadonlyMap<string, Media>;
};

export type ShareLoad =
  | { state: "not_found" }
  | { state: "gone"; reason: "withdrawn" | "removed" }
  | { state: "ok"; data: SharePost };

/** Only active posts are shown; everything else is gone (410) until purged (then 404). */
export async function loadSharePost(db: Db, slug: string): Promise<ShareLoad> {
  if (!SLUG_PATTERN.test(slug)) return { state: "not_found" };
  const post = await findPostBySlug(db, slug);
  if (!post) return { state: "not_found" };
  if (post.status !== "active") return { state: "gone", reason: post.status === "removed" ? "removed" : "withdrawn" };
  const revision = post.current_revision_id ? await findRevision(db, post.current_revision_id) : undefined;
  if (!revision) return { state: "not_found" };
  // Stored documents were validated on write; a parse failure here is a server bug (500).
  const document = documentSchema.parse(revision.document);
  const [author, media] = await Promise.all([findProfile(db, post.author_id), findMediaByIds(db, documentMediaIds(document))]);
  // post.author_id references profile (FK); a missing row means the account is being deleted.
  if (!author) return { state: "not_found" };
  return { state: "ok", data: { post, author, revision, document, media: new Map(media.map((m) => [m.id, m])) } };
}
