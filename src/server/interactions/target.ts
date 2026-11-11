import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { ApiError, notFound } from "@/server/http/errors";
import { SLUG_PATTERN } from "@/server/posts/slug";
import { canSee } from "@/server/posts/visibility";

/**
 * Which posts an interaction takes, beyond being seen by the viewer (posts/visibility.ts):
 * - `public`: public posts only (reposts: they show to the reposter's followers);
 * - `audience`: also followers-only / friends-only posts the viewer may see (bookmarks, reports);
 * - `any`: also the viewer's own private posts (likes and comments: the author may use them, Xianglin 2026-10-28).
 */
export type InteractionScope = "public" | "audience" | "any";

/** Whether `viewerId` may interact with the post in `scope`. */
export async function mayInteract(db: Db, post: Pick<Post, "visibility" | "author_id">, viewerId: string | null, scope: InteractionScope): Promise<boolean> {
  if (post.visibility === "public") return true;
  if (scope === "public" || (scope === "audience" && post.visibility === "private")) return false;
  return canSee(db, post, viewerId);
}

/**
 * The live post behind an interaction request (gone posts take no likes / comments). Posts the viewer may
 * not see, or may not use in `scope`, look nonexistent (404).
 */
export async function interactivePost(db: Db, slug: string, viewerId: string | null, scope: InteractionScope): Promise<Post> {
  if (!SLUG_PATTERN.test(slug)) throw notFound("post.not_found");
  const post = await findPostBySlug(db, slug);
  if (!post || !(await mayInteract(db, post, viewerId, scope))) throw notFound("post.not_found");
  if (post.status !== "active") throw new ApiError("post.gone", 410);
  return post;
}
