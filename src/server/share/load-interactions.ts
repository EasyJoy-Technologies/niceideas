import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { countVisibleTopLevel, listReplies, listTopLevel, type CommentRow } from "@/server/db/repos/comments";
import { bookmarkedAmong } from "@/server/db/repos/bookmarks";
import { COMMENT_LIKE, likedAmong, POST_LIKE } from "@/server/db/repos/likes";
import { likerKeysOf } from "@/server/interactions/actor";

export const COMMENTS_PER_PAGE = 30;

export type CommentThread = { comment: CommentRow; replies: CommentRow[] };

export type PageInteractions = {
  liked: boolean;
  /** Saved by the signed-in viewer. */
  bookmarked: boolean;
  likedComments: ReadonlySet<string>;
  threads: CommentThread[];
  /** 1-based page of top-level comments; `hasMore` links to the next one. */
  page: number;
  hasMore: boolean;
};

/**
 * Likes / comments / bookmark state shown on a post page for this viewer (`viewerId` null = signed out)
 * and browser (`visitorKey` null = no cookie yet).
 */
export async function loadPageInteractions(db: Db, post: Post, viewerId: string | null, visitorKey: string | null, page: number): Promise<PageInteractions> {
  const offset = (page - 1) * COMMENTS_PER_PAGE;
  const [top, total] = await Promise.all([listTopLevel(db, post.id, COMMENTS_PER_PAGE, offset), countVisibleTopLevel(db, post.id)]);
  const replies = await listReplies(db, top.map((c) => c.id));
  const threads = top.map((comment) => ({ comment, replies: replies.filter((r) => r.parent_id === comment.id) }));
  const ids = [...top, ...replies].map((c) => c.id);
  const keys = likerKeysOf(viewerId, visitorKey);
  const [liked, likedComments, bookmarked] = await Promise.all([likedAmong(db, POST_LIKE, [post.id], keys), likedAmong(db, COMMENT_LIKE, ids, keys), bookmarkedAmong(db, viewerId, [post.id])]);
  return { liked: liked.has(post.id), bookmarked: bookmarked.has(post.id), likedComments, threads, page, hasMore: offset + top.length < total };
}

/** `?cpage=N` → page number (defaults to 1, bounded). */
export function commentPage(url: URL): number {
  const n = Number(url.searchParams.get("cpage"));
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}
