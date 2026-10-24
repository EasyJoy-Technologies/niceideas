import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostByShareId, insertPost } from "@/server/db/repos/posts";
import { isUniqueViolation } from "@/server/db/repos/profiles";
import { ApiError } from "@/server/http/errors";
import { generateSlug } from "@/server/posts/slug";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { followNiceMatrixProfile } from "@/server/profiles/profile-follow";
import type { CreateShareInput } from "./requests";

const MAX_SLUG_ATTEMPTS = 3;

async function existing(db: Db, input: CreateShareInput): Promise<{ post: Post; created: false } | null> {
  const post = await findPostByShareId(db, input.shareId);
  if (!post) return null;
  // A share id belongs to one user for good.
  if (post.author_id !== input.userId) throw new ApiError("share.conflict", 409);
  return { post, created: false };
}

/**
 * POST /posts (contract niceideas-share.md §3.2): idempotent by share id, database only (no
 * outside calls), so it answers in milliseconds. The new post is `preparing` until the first
 * content push. The profile is created on first contact and follows the sent NiceMatrix data.
 */
export async function createShare(db: Db, input: CreateShareInput): Promise<{ post: Post; created: boolean }> {
  const found = await existing(db, input);
  if (found) return found;
  const profile = await ensureProfile(db, input.userId);
  if (profile.status !== "active") throw new ApiError("user.deleting", 409);
  if (input.profile) await followNiceMatrixProfile(db, profile, input.profile);
  for (let attempt = 1; ; attempt++) {
    try {
      const post = await insertPost(db, {
        slug: generateSlug(),
        author_id: input.userId,
        source: "nicenote",
        share_id: input.shareId,
        region: input.region,
        source_ref: null,
        api_client_id: null,
        status: "preparing",
        kind: "short",
        sync_mode: input.syncMode,
        comments_mode: input.commentsMode ?? "open",
        cover_media_id: null,
        current_revision_id: null,
        source_updated_at: null,
        status_changed_at: null,
        status_reason: null,
        purge_after: null,
        source_revision: null,
      });
      return { post, created: true };
    } catch (err) {
      if (isUniqueViolation(err, "post_share_id_key")) {
        const raced = await existing(db, input);
        if (raced) return raced;
      }
      if (!isUniqueViolation(err, "post_slug_key") || attempt >= MAX_SLUG_ATTEMPTS) throw err;
    }
  }
}
