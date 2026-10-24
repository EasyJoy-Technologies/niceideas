import type { Db } from "@/server/db/client";
import type { CommentsMode, CommentStatus } from "@/server/db/schema";
import { findComment, setCommentStatus } from "@/server/db/repos/comments";
import { closeReport, deleteBan, recordModeration, upsertBan } from "@/server/db/repos/moderation";
import { findPostBySlug, updatePost } from "@/server/db/repos/posts";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { findMediaByIds } from "@/server/db/repos/media";
import { projectMediaPublic, recordMediaPublic, withdrawUnreferencedMedia } from "@/server/media/publication";
import { queuePostEvent } from "@/server/nicenote/post-events";
import type { MediaStores } from "@/server/storage/types";

/**
 * Platform moderation (plan §11, §16.2). Every action is written to
 * `moderation_action` with the operator and reason. Used by the server-side
 * moderation CLI and the web admin page (/admin, ADMIN_USER_IDS only).
 */
export type Operator = { actorId: string; reason: string };
export type ModerationRuntime = { db: Db; stores: MediaStores; cacheControl: string; retentionDays: number };

export class ModerationError extends Error {}

async function postBySlug(db: Db, slug: string) {
  const post = await findPostBySlug(db, slug);
  if (!post) throw new ModerationError(`post not found: ${slug}`);
  return post;
}

export async function setCommentVisibility(db: Db, op: Operator, commentId: string, status: CommentStatus): Promise<void> {
  const comment = await findComment(db, commentId);
  if (!comment) throw new ModerationError(`comment not found: ${commentId}`);
  await setCommentStatus(db, comment.id, status);
  const action = status === "visible" ? "restore_comment" : status === "hidden" ? "hide_comment" : "delete_comment";
  await recordModeration(db, { action, actorId: op.actorId, reason: op.reason, postId: comment.post_id, commentId: comment.id });
}

/** Bans the browser (default) or network address behind a comment; optionally hides the comment too. */
export async function banCommenter(db: Db, op: Operator, commentId: string, opts: { byIp: boolean; days: number | null; hide: boolean }): Promise<void> {
  const comment = await findComment(db, commentId);
  if (!comment) throw new ModerationError(`comment not found: ${commentId}`);
  const kind = opts.byIp || !comment.visitor_key ? "ip" : "visitor";
  const keyHash = kind === "ip" ? comment.ip_hash : comment.visitor_key!;
  const expiresAt = opts.days ? new Date(Date.now() + opts.days * 86_400_000) : null;
  await upsertBan(db, { kind, keyHash, reason: op.reason, createdBy: op.actorId, expiresAt });
  await recordModeration(db, { action: "ban", actorId: op.actorId, reason: op.reason, postId: comment.post_id, commentId: comment.id, detail: `${kind}:${keyHash}` });
  if (opts.hide) await setCommentVisibility(db, op, comment.id, "hidden");
}

export async function liftBan(db: Db, op: Operator, kind: "visitor" | "ip", keyHash: string): Promise<boolean> {
  const removed = (await deleteBan(db, kind, keyHash)) > 0;
  if (removed) await recordModeration(db, { action: "unban", actorId: op.actorId, reason: op.reason, detail: `${kind}:${keyHash}` });
  return removed;
}

export async function setCommentsMode(db: Db, op: Operator, slug: string, mode: CommentsMode): Promise<void> {
  const post = await postBySlug(db, slug);
  await updatePost(db, post.id, { comments_mode: mode });
  await recordModeration(db, { action: "comments_mode", actorId: op.actorId, reason: op.reason, postId: post.id, detail: mode });
}

/** Takes a post down (page answers 410, media leave the public bucket, purge after the retention period). */
export async function removePost(rt: ModerationRuntime, op: Operator, slug: string): Promise<void> {
  const post = await postBySlug(rt.db, slug);
  if (post.status === "removed") return;
  if (post.status !== "active") throw new ModerationError(`post is ${post.status}`);
  const now = new Date();
  await rt.db.transaction().execute(async (trx) => {
    await updatePost(trx, post.id, { status: "removed", status_changed_at: now, status_reason: op.reason, purge_after: new Date(now.getTime() + rt.retentionDays * 86_400_000) });
    await recordModeration(trx, { action: "remove", actorId: op.actorId, reason: op.reason, postId: post.id });
    await queuePostEvent(trx, post, "removed");
  });
  const media = post.current_revision_id ? await listRevisionMediaIds(rt.db, post.current_revision_id) : [];
  await withdrawUnreferencedMedia(rt.db, rt.stores, media);
}

/** Reverses a takedown within the retention period: the link works again with the same content. */
export async function restorePost(rt: ModerationRuntime, op: Operator, slug: string): Promise<void> {
  const post = await postBySlug(rt.db, slug);
  if (post.status !== "removed") throw new ModerationError(`post is ${post.status}`);
  const media = await findMediaByIds(rt.db, post.current_revision_id ? await listRevisionMediaIds(rt.db, post.current_revision_id) : []);
  await projectMediaPublic(rt.stores, media, rt.cacheControl);
  await rt.db.transaction().execute(async (trx) => {
    await updatePost(trx, post.id, { status: "active", status_changed_at: new Date(), status_reason: null, purge_after: null });
    await recordMediaPublic(trx, media.map((m) => m.id));
    await recordModeration(trx, { action: "restore", actorId: op.actorId, reason: op.reason, postId: post.id });
    await queuePostEvent(trx, post, "restored");
  });
}

export async function closeReportAs(db: Db, op: Operator, reportId: string, outcome: "resolved" | "dismissed"): Promise<void> {
  const report = await closeReport(db, reportId, outcome, op.actorId);
  if (!report) throw new ModerationError(`no open report ${reportId}`);
  await recordModeration(db, {
    action: outcome === "resolved" ? "resolve_report" : "dismiss_report",
    actorId: op.actorId, reason: op.reason, postId: report.post_id, commentId: report.comment_id, detail: report.id,
  });
}
