import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { findPostByShareId, insertPost } from "@/server/db/repos/posts";
import { isUniqueViolation } from "@/server/db/repos/profiles";
import { registerSourceApp } from "@/server/db/repos/source-apps";
import { ApiError } from "@/server/http/errors";
import { generateSlug } from "@/server/posts/slug";
import { assertAuthorActive } from "@/server/accounts/author-gate";
import type { CreateShareInput } from "./requests";
import { prepareSourceAuthor } from "./source-author";

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
 * content push. The profile is created on first contact and follows the sent NiceMatrix data. The source app
 * is recorded only here: a repeated request for the same share id never changes it. A new app is registered
 * for the admin Apps page ("From <app>" stays off until turned on there).
 */
export async function createShare(db: Db, input: CreateShareInput): Promise<{ post: Post; created: boolean }> {
  const found = await existing(db, input);
  if (found) return found;
  await prepareSourceAuthor(db, input.userId, input.profile);
  for (let attempt = 1; ; attempt++) {
    try {
      // Re-checked under the profile lock: a deletion request committed meanwhile wins.
      const post = await db.transaction().execute(async (trx) => {
        await assertAuthorActive(trx, input.userId);
        if (input.sourceApp) await registerSourceApp(trx, input.sourceApp);
        return insertPost(trx, {
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
          source_app_key: input.sourceApp?.key ?? null,
          source_app_names: input.sourceApp ? JSON.stringify(input.sourceApp.names) : null,
        });
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
