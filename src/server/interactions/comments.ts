import { z } from "zod";
import type { Db } from "@/server/db/client";
import type { Comment } from "@/server/db/schema";
import { countCommentsSince, findComment, insertComment } from "@/server/db/repos/comments";
import { ApiError, badRequest, forbidden } from "@/server/http/errors";
import { limits, rateLimited } from "./guards";
import { verifyProof } from "./pow";
import { interactivePost } from "./target";
import type { Visitor } from "./visitor";

export const COMMENT_MAX_CHARS = 2000;
export const NAME_MAX_CHARS = 40;

const body = z.object({
  body: z.string(),
  name: z.string().optional(),
  parentId: z.uuid().optional(),
  challenge: z.string().max(200),
  nonce: z.string().max(12),
});

/** Strips control characters (except newlines) and trims. */
const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
const chars = (s: string) => Array.from(s).length;

export type CommentDto = { id: string; parentId: string | null; name: string | null; anonymous: boolean; body: string; createdAt: string; likeCount: number };

export function toCommentDto(c: Comment): CommentDto {
  return { id: c.id, parentId: c.parent_id, name: c.anon_name, anonymous: c.author_id === null, body: c.body, createdAt: c.created_at.toISOString(), likeCount: c.like_count };
}

/**
 * Anonymous comment (plan §16.2, Q4): shown at once, moderated afterwards.
 * Guards: same-origin + ban check (caller), comments mode, proof of work,
 * per-visitor / per-address limits, length limits, one reply level.
 */
export async function createAnonymousComment(db: Db, slug: string, visitor: Visitor, payload: unknown): Promise<Comment> {
  const parsed = body.safeParse(payload);
  if (!parsed.success) throw badRequest("request.invalid");
  const input = parsed.data;
  const text = clean(input.body);
  const name = input.name ? clean(input.name).replace(/\s+/g, " ") : "";
  if (!text) throw badRequest("comment.empty");
  if (chars(text) > COMMENT_MAX_CHARS) throw badRequest("comment.too_long", { maxChars: COMMENT_MAX_CHARS });
  if (chars(name) > NAME_MAX_CHARS) throw badRequest("comment.name_too_long", { maxChars: NAME_MAX_CHARS });

  const post = await interactivePost(db, slug);
  if (post.comments_mode === "closed") throw forbidden("comments.closed");
  if (post.comments_mode === "signed_in") throw forbidden("comments.signed_in_only");
  if (!(await verifyProof(db, input.challenge, input.nonce))) throw new ApiError("comment.proof_invalid", 422);

  const cfg = limits();
  if ((await countCommentsSince(db, "visitor_key", visitor.key, 600)) >= cfg.RATE_ANON_COMMENTS_PER_10MIN) throw rateLimited(600);
  if ((await countCommentsSince(db, "ip_hash", visitor.ipHash, 600)) >= cfg.RATE_IP_COMMENTS_PER_10MIN) throw rateLimited(600);
  if ((await countCommentsSince(db, "ip_hash", visitor.ipHash, 86_400)) >= cfg.RATE_IP_COMMENTS_PER_DAY) throw rateLimited(86_400);

  if (input.parentId) {
    const parent = await findComment(db, input.parentId);
    if (!parent || parent.post_id !== post.id || parent.status !== "visible") throw badRequest("comment.parent_invalid");
    // One reply level: replying to a reply attaches to its top-level comment.
    input.parentId = parent.parent_id ?? parent.id;
  }
  return insertComment(db, {
    post_id: post.id,
    parent_id: input.parentId ?? null,
    author_id: null,
    visitor_key: visitor.key,
    anon_name: name || null,
    ip_hash: visitor.ipHash,
    body: text,
  });
}
