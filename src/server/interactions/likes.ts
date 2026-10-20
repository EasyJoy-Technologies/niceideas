import type { Db } from "@/server/db/client";
import { addLike, COMMENT_LIKE, countLikesByIpSince, POST_LIKE, removeLike } from "@/server/db/repos/likes";
import { findComment } from "@/server/db/repos/comments";
import { ApiError, notFound } from "@/server/http/errors";
import { limits, rateLimited } from "./guards";
import { interactivePost } from "./target";
import type { Visitor } from "./visitor";

const HOUR = 3600;

async function assertLikeBudget(db: Db, visitor: Visitor): Promise<void> {
  if ((await countLikesByIpSince(db, visitor.ipHash, HOUR)) >= limits().RATE_IP_LIKES_PER_HOUR) throw rateLimited(HOUR);
}

/** Guest like / unlike of a post (signed-in likes use `u:<userId>` keys from phase 2 login). */
export async function setPostLike(db: Db, slug: string, visitor: Visitor, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  const post = await interactivePost(db, slug);
  if (!liked) return { liked, likeCount: await removeLike(db, POST_LIKE, post.id, visitor.key) };
  await assertLikeBudget(db, visitor);
  return { liked, likeCount: await addLike(db, POST_LIKE, post.id, { likerKey: visitor.key, userId: null, ipHash: visitor.ipHash }) };
}

export async function setCommentLike(db: Db, commentId: string, visitor: Visitor, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  const comment = /^[0-9a-f-]{36}$/i.test(commentId) ? await findComment(db, commentId) : undefined;
  if (!comment || comment.status !== "visible") throw notFound("comment.not_found");
  const post = await db.selectFrom("post").select("status").where("id", "=", comment.post_id).executeTakeFirst();
  if (post?.status !== "active") throw new ApiError("post.gone", 410);
  if (!liked) return { liked, likeCount: await removeLike(db, COMMENT_LIKE, comment.id, visitor.key) };
  await assertLikeBudget(db, visitor);
  return { liked, likeCount: await addLike(db, COMMENT_LIKE, comment.id, { likerKey: visitor.key, userId: null, ipHash: visitor.ipHash }) };
}
