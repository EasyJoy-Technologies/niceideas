import { z } from "zod";
import type { Db } from "@/server/db/client";
import type { Comment } from "@/server/db/schema";
import { countCommentsSince, findComment, insertComment, type CommentAuthor, type CommentRow } from "@/server/db/repos/comments";
import { ApiError, badRequest, forbidden } from "@/server/http/errors";
import { limits, rateLimited } from "./guards";
import { verifyProof } from "./pow";
import { interactivePost } from "./target";
import type { Actor } from "./actor";

export const COMMENT_MAX_CHARS = 2000;
export const NAME_MAX_CHARS = 40;

const body = z.object({
  body: z.string(),
  name: z.string().optional(),
  parentId: z.uuid().optional(),
  // Proof of work: anonymous comments only.
  challenge: z.string().max(200).optional(),
  nonce: z.string().max(12).optional(),
});

/** Strips control characters (except newlines) and trims. */
const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
const chars = (s: string) => Array.from(s).length;

export type CommentDto = { id: string; parentId: string | null; name: string | null; anonymous: boolean; body: string; createdAt: string; likeCount: number };

/** `name`: the nickname of an anonymous comment, or the display name (else @handle) of a signed-in author when known. */
export function toCommentDto(c: Comment & Partial<CommentAuthor>): CommentDto {
  const anonymous = c.author_id === null;
  const name = anonymous ? c.anon_name : c.author_name || (c.author_handle ? `@${c.author_handle}` : null);
  return { id: c.id, parentId: c.parent_id, name, anonymous, body: c.body, createdAt: c.created_at.toISOString(), likeCount: c.like_count };
}

/** Rate limits: anonymous ones per browser and address; signed-in ones per account and address. */
async function assertCommentBudget(db: Db, actor: Actor): Promise<void> {
  const cfg = limits();
  const own = actor.viewer
    ? (await countCommentsSince(db, "author_id", actor.viewer.user_id, 600)) >= cfg.RATE_USER_COMMENTS_PER_10MIN
    : (await countCommentsSince(db, "visitor_key", actor.visitor.key, 600)) >= cfg.RATE_ANON_COMMENTS_PER_10MIN;
  if (own) throw rateLimited(600);
  if ((await countCommentsSince(db, "ip_hash", actor.visitor.ipHash, 600)) >= cfg.RATE_IP_COMMENTS_PER_10MIN) throw rateLimited(600);
  if ((await countCommentsSince(db, "ip_hash", actor.visitor.ipHash, 86_400)) >= cfg.RATE_IP_COMMENTS_PER_DAY) throw rateLimited(86_400);
}

/**
 * New comment (plan §16.2, Q4), shown at once and moderated afterwards. A signed-in viewer comments as
 * their account (profile name and avatar; also where comments are for signed-in users only); otherwise it
 * is anonymous with an optional nickname and needs a proof of work. Guards: same-origin + ban check
 * (caller), comments mode, rate limits, length limits, one reply level.
 */
export async function createComment(db: Db, slug: string, actor: Actor, payload: unknown): Promise<CommentRow> {
  const parsed = body.safeParse(payload);
  if (!parsed.success) throw badRequest("request.invalid");
  const input = parsed.data;
  const { viewer, visitor } = actor;
  const text = clean(input.body);
  const name = !viewer && input.name ? clean(input.name).replace(/\s+/g, " ") : "";
  if (!text) throw badRequest("comment.empty");
  if (chars(text) > COMMENT_MAX_CHARS) throw badRequest("comment.too_long", { maxChars: COMMENT_MAX_CHARS });
  if (chars(name) > NAME_MAX_CHARS) throw badRequest("comment.name_too_long", { maxChars: NAME_MAX_CHARS });

  const post = await interactivePost(db, slug);
  if (post.comments_mode === "closed") throw forbidden("comments.closed");
  if (post.comments_mode === "signed_in" && !viewer) throw forbidden("comments.signed_in_only");
  if (!viewer && !(await verifyProof(db, input.challenge ?? "", input.nonce ?? ""))) throw new ApiError("comment.proof_invalid", 422);
  await assertCommentBudget(db, actor);

  if (input.parentId) {
    const parent = await findComment(db, input.parentId);
    if (!parent || parent.post_id !== post.id || parent.status !== "visible") throw badRequest("comment.parent_invalid");
    // One reply level: replying to a reply attaches to its top-level comment.
    input.parentId = parent.parent_id ?? parent.id;
  }
  const comment = await insertComment(db, {
    post_id: post.id,
    parent_id: input.parentId ?? null,
    author_id: viewer?.user_id ?? null,
    // Kept for signed-in comments too: moderation bans by browser or address.
    visitor_key: visitor.key,
    anon_name: name || null,
    ip_hash: visitor.ipHash,
    body: text,
  });
  return { ...comment, author_handle: viewer?.handle ?? null, author_name: viewer?.display_name ?? null, author_avatar: viewer?.avatar_url ?? null };
}
