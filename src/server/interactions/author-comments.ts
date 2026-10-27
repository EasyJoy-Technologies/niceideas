import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import { findComment, listRecentComments, setCommentStatus } from "@/server/db/repos/comments";
import { recordModeration } from "@/server/db/repos/moderation";
import { notFound } from "@/server/http/errors";
import { loadOwnPost } from "@/server/posts/access";
import { toCommentDto, type CommentDto } from "./comments";

const AUTHOR_LIST_LIMIT = 200;

/** Latest visible comments on the caller's own post (management in the app). */
export async function listCommentsForAuthor(db: Db, principal: Principal, postId: string): Promise<CommentDto[]> {
  const post = await loadOwnPost(db, principal, postId);
  return (await listRecentComments(db, AUTHOR_LIST_LIMIT, post.id)).filter((c) => c.status === "visible").map((c) => toCommentDto(c));
}

/** The author may delete any comment under their own post (plan §16.2); audited. Idempotent. */
export async function deleteCommentAsAuthor(db: Db, principal: Principal, postId: string, commentId: string): Promise<void> {
  const post = await loadOwnPost(db, principal, postId);
  const comment = /^[0-9a-f-]{36}$/i.test(commentId) ? await findComment(db, commentId) : undefined;
  if (!comment || comment.post_id !== post.id) throw notFound("comment.not_found");
  if (comment.status === "deleted") return;
  await setCommentStatus(db, comment.id, "deleted");
  await recordModeration(db, { action: "delete_comment", actorId: principal.userId, reason: "author", postId: post.id, commentId: comment.id });
}
