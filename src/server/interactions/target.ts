import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { ApiError, notFound } from "@/server/http/errors";
import { SLUG_PATTERN } from "@/server/posts/slug";

/** The live post behind an interaction request (gone posts take no likes / comments; private ones look nonexistent). */
export async function interactivePost(db: Db, slug: string): Promise<Post> {
  if (!SLUG_PATTERN.test(slug)) throw notFound("post.not_found");
  const post = await findPostBySlug(db, slug);
  if (!post || post.visibility !== "public") throw notFound("post.not_found");
  if (post.status !== "active") throw new ApiError("post.gone", 410);
  return post;
}
