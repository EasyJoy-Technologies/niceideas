import type { Db } from "@/server/db/client";
import type { FeedCursor } from "@/server/db/repos/feed";
import { findMediaByIds } from "@/server/db/repos/media";
import { listProfileReposts } from "@/server/db/repos/reposts";
import { listUserReplies } from "@/server/db/repos/user-replies";
import { cursorOf, FEED_PAGE_SIZE, feedItems, type FeedPage, type FeedViewer } from "./load-feed";
import type { QuotedPost } from "./load-quotes";

/** One of the account's comments (profile "Replies"): whom it answers and the post it is on. */
export type ReplyItem = { id: string; body: string; at: Date; toHandle: string | null; toName: string | null; post: QuotedPost };
export type RepliesPage = { items: ReplyItem[]; next: string | null };

/** Profile "Reposts": plain reposts and quotes, newest first (cursor on repost / publishing time). */
export async function loadProfileReposts(db: Db, userId: string, own: boolean, cursor: FeedCursor | null, viewer: FeedViewer): Promise<FeedPage> {
  const rows = await listProfileReposts(db, userId, own, cursor, FEED_PAGE_SIZE + 1);
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page[page.length - 1];
  return { items: await feedItems(db, page, viewer), next: rows.length > FEED_PAGE_SIZE ? cursorOf(last.feed_at ?? last.published_at, last.id) : null };
}

/** Profile "Replies": the account's comments on posts everyone can see, newest first. */
export async function loadProfileReplies(db: Db, userId: string, cursor: FeedCursor | null): Promise<RepliesPage> {
  const rows = await listUserReplies(db, userId, cursor, FEED_PAGE_SIZE + 1);
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const covers = new Map((await findMediaByIds(db, page.flatMap((r) => (r.post_cover_media_id ? [r.post_cover_media_id] : [])))).map((m) => [m.id, m]));
  const items = page.map((r) => ({
    id: r.id,
    body: r.body,
    at: r.created_at,
    toHandle: r.to_handle,
    toName: r.to_name,
    post: {
      slug: r.post_slug, kind: r.post_kind, title: r.post_title, summary: r.post_summary, published_at: r.post_published_at,
      author_handle: r.post_author_handle, author_name: r.post_author_name, author_avatar: r.post_author_avatar,
      cover: r.post_cover_media_id ? covers.get(r.post_cover_media_id) ?? null : null,
    },
  }));
  const last = page[page.length - 1];
  return { items, next: rows.length > FEED_PAGE_SIZE ? cursorOf(last.created_at, last.id) : null };
}
