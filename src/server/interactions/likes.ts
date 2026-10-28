import type { Db } from "@/server/db/client";
import { addLike, COMMENT_LIKE, countLikesByIpSince, POST_LIKE, removeLike, type LikeTarget } from "@/server/db/repos/likes";
import { findComment } from "@/server/db/repos/comments";
import { ApiError, notFound } from "@/server/http/errors";
import { accountLikerKey, likerKeysOf, type Actor } from "./actor";
import { limits, rateLimited } from "./guards";
import { interactivePost, mayInteract } from "./target";

const HOUR = 3600;

type LikeResult = { liked: boolean; likeCount: number };

/**
 * Like / unlike as the actor: a signed-in viewer likes as their account (unless this browser already
 * liked as a guest) and unliking removes both; a guest likes as the browser. Address budget for both.
 */
async function setLike(db: Db, target: LikeTarget, id: string, actor: Actor, liked: boolean): Promise<LikeResult> {
  const { visitor, viewer } = actor;
  const keys = likerKeysOf(viewer?.user_id ?? null, visitor.key);
  if (!liked) return { liked, likeCount: await removeLike(db, target, id, keys) };
  if ((await countLikesByIpSince(db, visitor.ipHash, HOUR)) >= limits().RATE_IP_LIKES_PER_HOUR) throw rateLimited(HOUR);
  const liker = viewer
    ? { likerKey: accountLikerKey(viewer.user_id), userId: viewer.user_id, ipHash: visitor.ipHash }
    : { likerKey: visitor.key, userId: null, ipHash: visitor.ipHash };
  return { liked, likeCount: await addLike(db, target, id, liker, keys.filter((k) => k !== liker.likerKey)) };
}

export async function setPostLike(db: Db, slug: string, actor: Actor, liked: boolean): Promise<LikeResult> {
  const post = await interactivePost(db, slug, actor.viewer?.user_id ?? null);
  return setLike(db, POST_LIKE, post.id, actor, liked);
}

export async function setCommentLike(db: Db, commentId: string, actor: Actor, liked: boolean): Promise<LikeResult> {
  const comment = /^[0-9a-f-]{36}$/i.test(commentId) ? await findComment(db, commentId) : undefined;
  if (!comment || comment.status !== "visible") throw notFound("comment.not_found");
  const post = await db.selectFrom("post").select(["status", "visibility", "author_id"]).where("id", "=", comment.post_id).executeTakeFirst();
  if (!post || !mayInteract(post, actor.viewer?.user_id ?? null)) throw notFound("comment.not_found");
  if (post.status !== "active") throw new ApiError("post.gone", 410);
  return setLike(db, COMMENT_LIKE, comment.id, actor, liked);
}
