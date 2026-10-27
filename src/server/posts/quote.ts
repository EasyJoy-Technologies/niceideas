import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostBySlug } from "@/server/db/repos/posts";
import { findProfile } from "@/server/db/repos/profiles";
import { ApiError } from "@/server/http/errors";
import { SLUG_PATTERN } from "./slug";

/** `quote` form value → slug, or null when absent / malformed (a malformed one is treated as gone). */
export function quoteSlugOf(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The post a new quote may quote: live, public, its author active. Anything else (private, offline,
 * removed, being deleted, unknown) is `compose.quote_gone` — the compose box says it is no longer available.
 */
export async function findQuotable(db: Db, slug: string): Promise<Post> {
  const gone = new ApiError("compose.quote_gone", 422);
  if (!SLUG_PATTERN.test(slug)) throw gone;
  const post = await findPostBySlug(db, slug);
  if (!post || post.status !== "active" || post.visibility !== "public") throw gone;
  const author = await findProfile(db, post.author_id);
  if (!author || author.status !== "active") throw gone;
  return post;
}
