import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { ApiError, notFound } from "@/server/http/errors";
import { SLUG_PATTERN } from "@/server/posts/slug";

/** Public posts take interactions from anyone; private ones from their signed-in author only. */
export const mayInteract = (post: Pick<Post, "visibility" | "author_id">, viewerId: string | null) =>
  post.visibility === "public" || (!!viewerId && post.author_id === viewerId);

/**
 * The live post behind an interaction request (gone posts take no likes / comments). Private posts look
 * nonexistent, except when `viewerId` is their signed-in author, who may like and comment on them (Xianglin 2026-10-28).
 */
export async function interactivePost(db: Db, slug: string, viewerId: string | null = null): Promise<Post> {
  if (!SLUG_PATTERN.test(slug)) throw notFound("post.not_found");
  const post = await findPostBySlug(db, slug);
  if (!post || !mayInteract(post, viewerId)) throw notFound("post.not_found");
  if (post.status !== "active") throw new ApiError("post.gone", 410);
  return post;
}
