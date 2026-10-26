import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post, PostKind, SyncMode } from "@/server/db/schema";
import { findLivePostBySource, insertPost, updatePost } from "@/server/db/repos/posts";
import { findRevision, insertRevision, linkRevisionMedia } from "@/server/db/repos/revisions";
import { isUniqueViolation } from "@/server/db/repos/profiles";
import { contentHash } from "@/server/documents/hash";
import type { PostDocument } from "@/server/documents/schema";
import { accountDeleting, assertAuthorActive, readAuthorState } from "@/server/accounts/author-gate";
import { projectMediaPublic, recordMediaPublic, settlePublication } from "@/server/media/publication";
import type { MediaStores } from "@/server/storage/types";
import { derivedFields } from "./derived-fields";
import { resolveDocumentMedia } from "./media-refs";
import { assertCanCreatePost, assertClientBudget } from "./rate-limit";
import { generateSlug } from "./slug";

export type CreatePostInput = {
  document: PostDocument;
  sourceRef: string;
  sourceUpdatedAt: Date | null;
  kind?: PostKind;
  syncMode?: SyncMode;
};

export type CreatePostResult = { post: Post; contentHash: string | null; created: boolean };

const MAX_SLUG_ATTEMPTS = 3;

async function existing(db: Db, principal: Principal, sourceRef: string): Promise<CreatePostResult | null> {
  const post = await findLivePostBySource(db, principal.userId, principal.source, sourceRef);
  if (!post) return null;
  const rev = post.current_revision_id ? await findRevision(db, post.current_revision_id) : undefined;
  return { post, contentHash: rev?.content_hash ?? null, created: false };
}

/**
 * Publishes a document (plan §8, §10). Sharing the same note again returns the
 * existing live publication unchanged (content updates go through sync).
 */
export async function createPost(
  db: Db,
  stores: MediaStores,
  principal: Principal,
  input: CreatePostInput,
  cacheControl: string,
): Promise<CreatePostResult> {
  const found = await existing(db, principal, input.sourceRef);
  if (found) return found;

  if ((await readAuthorState(db, principal.userId)) !== "active") throw accountDeleting();
  await assertCanCreatePost(db, principal.userId);
  if (principal.apiClientId) await assertClientBudget(db, principal.apiClientId, principal.userId);
  const media = await resolveDocumentMedia(db, principal.userId, input.document);
  await projectMediaPublic(stores, media, cacheControl);

  const hash = contentHash(input.document);
  const fields = derivedFields(input.document);
  const moved = media.map((m) => m.id);
  let live: string[] = [];
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const post = await db.transaction().execute(async (trx) => {
          // The author lock first (author-gate.ts): an account being deleted publishes nothing.
          await assertAuthorActive(trx, principal.userId);
          const row = await insertPost(trx, {
            slug: generateSlug(),
            author_id: principal.userId,
            source: principal.source,
            api_client_id: principal.apiClientId ?? null,
            source_ref: input.sourceRef,
            sync_mode: input.syncMode ?? "follow",
            ...fields,
            kind: input.kind ?? fields.kind!,
            kind_locked: input.kind !== undefined,
            source_updated_at: input.sourceUpdatedAt,
          });
          const rev = await insertRevision(trx, { postId: row.id, document: input.document, contentHash: hash, sourceUpdatedAt: input.sourceUpdatedAt });
          await linkRevisionMedia(trx, rev.id, media.map((m) => m.id));
          await recordMediaPublic(trx, media.map((m) => m.id));
          return updatePost(trx, row.id, { current_revision_id: rev.id });
        });
        live = moved;
        return { post, contentHash: hash, created: true };
      } catch (err) {
        if (isUniqueViolation(err, "post_live_source_key")) {
          const raced = await existing(db, principal, input.sourceRef);
          if (raced) return raced;
        }
        if (isUniqueViolation(err, "post_slug_key") && attempt < MAX_SLUG_ATTEMPTS) continue;
        throw err;
      }
    }
  } finally {
    // Media moved for a post that was not created (account being deleted, error, raced) go back.
    await settlePublication(db, stores, cacheControl, { moved, live }).catch((e) => console.error("[posts] media settle failed", e));
  }
}
