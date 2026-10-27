import type { Db } from "@/server/db/client";
import type { Media, MediaJobState } from "@/server/db/schema";
import { bookmarkedAmong, listBookmarkedPosts } from "@/server/db/repos/bookmarks";
import { findRevisions, listFeed, type FeedCursor, type FeedFilter, type FeedRow } from "@/server/db/repos/feed";
import { likedAmong, POST_LIKE } from "@/server/db/repos/likes";
import { likerKeysOf } from "@/server/interactions/actor";
import { findMediaByIds } from "@/server/db/repos/media";
import { documentPlainText } from "@/server/documents/derive";
import { documentMediaKeys, isSourceDocument, parseStoredDocument, type StoredDocument } from "@/server/documents/stored";
import { liveQuoteCounts, repostedAmong } from "@/server/db/repos/reposts";
import { loadDocumentMedia } from "./document-media";
import { loadQuoted, type QuotedPost } from "./load-quotes";

export const FEED_PAGE_SIZE = 20;

export type FeedItem = {
  post: FeedRow;
  document: StoredDocument;
  cover: Media | null;
  /** Media of short posts (shown in full under the text), keyed like the document's blocks; empty for articles. */
  media: ReadonlyMap<string, Media>;
  /** NiceNote shares: fetch state of media not stored yet. */
  jobs: ReadonlyMap<string, MediaJobState>;
  liked: boolean;
  /** Saved by the signed-in viewer. */
  bookmarked: boolean;
  /** Reposted by the signed-in viewer; shown count = plain reposts + live quotes. */
  reposted: boolean;
  repostCount: number;
  /** Quotes: the quoted post (null: no longer available to everyone); absent for other posts. */
  quoted?: QuotedPost | null;
  /** Article facts shown under the summary. */
  readingMinutes: number;
  images: number;
  audios: number;
};

export type FeedPage = { items: FeedItem[]; next: string | null };

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/gu;

/** ~400 CJK characters or ~220 words per minute; at least one minute. */
export function readingMinutes(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(cjk / 400 + words / 220));
}

/** Opaque `?before=` value: `<ms>_<post id>`. Invalid values start from the top. */
export function parseCursor(value: string | null): FeedCursor | null {
  const m = value?.match(/^(\d{10,15})_([0-9a-f-]{36})$/);
  return m ? { at: new Date(Number(m[1])), id: m[2] } : null;
}
export const cursorOf = (at: Date, id: string) => `${at.getTime()}_${id}`;

/** Who is looking: the signed-in viewer (if any) and the browser's visitor key (if it has one). */
export type FeedViewer = { viewerId: string | null; visitorKey: string | null };

/** One page of feed cards with everything the renderer needs (documents, covers, the viewer's likes and bookmarks). */
export async function loadFeed(db: Db, filter: FeedFilter, cursor: FeedCursor | null, viewer: FeedViewer): Promise<FeedPage> {
  const rows = await listFeed(db, filter, cursor, FEED_PAGE_SIZE + 1);
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page[page.length - 1];
  return { items: await feedItems(db, page, viewer), next: rows.length > FEED_PAGE_SIZE ? cursorOf(last.feed_at ?? last.published_at, last.id) : null };
}

/** The signed-in user's saved posts, most recently saved first (cursor on the save time). */
export async function loadBookmarks(db: Db, userId: string, cursor: FeedCursor | null, visitorKey: string | null): Promise<FeedPage> {
  const rows = await listBookmarkedPosts(db, userId, cursor, FEED_PAGE_SIZE + 1);
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page[page.length - 1];
  return { items: await feedItems(db, page, { viewerId: userId, visitorKey }), next: rows.length > FEED_PAGE_SIZE ? cursorOf(last.bookmarked_at, last.id) : null };
}

export async function feedItems(db: Db, page: FeedRow[], viewer: FeedViewer): Promise<FeedItem[]> {
  const revisions = new Map((await findRevisions(db, page.flatMap((p) => (p.current_revision_id ? [p.current_revision_id] : [])))).map((r) => [r.id, r]));
  const covers = new Map((await findMediaByIds(db, page.flatMap((p) => (p.cover_media_id ? [p.cover_media_id] : [])))).map((m) => [m.id, m]));
  const documents = new Map(page.map((p) => [p.id, p.current_revision_id ? revisions.get(p.current_revision_id) : undefined] as const).flatMap(([id, r]) => (r ? [[id, parseStoredDocument(r.document)] as const] : [])));
  const shorts = page.filter((p) => p.kind === "short" && documents.has(p.id));
  // API documents: one query by media id; NiceNote shares: by ref per author.
  const media = new Map((await findMediaByIds(db, shorts.flatMap((p) => (isSourceDocument(documents.get(p.id)!) ? [] : documentMediaKeys(documents.get(p.id)!))))).map((m) => [m.id, m]));
  const shared = new Map(await Promise.all(shorts.filter((p) => isSourceDocument(documents.get(p.id)!)).map(async (p) => [p.id, await loadDocumentMedia(db, p.author_id, documents.get(p.id)!)] as const)));
  const ids = page.map((p) => p.id);
  const [liked, bookmarked, reposted, quotes, quoted] = await Promise.all([
    likedAmong(db, POST_LIKE, ids, likerKeysOf(viewer.viewerId, viewer.visitorKey)),
    bookmarkedAmong(db, viewer.viewerId, ids),
    repostedAmong(db, viewer.viewerId, ids),
    liveQuoteCounts(db, ids),
    loadQuoted(db, page.flatMap((p) => (p.quote_of ? [p.quote_of] : []))),
  ]);
  const items: FeedItem[] = [];
  for (const post of page) {
    const document = documents.get(post.id);
    if (!document) continue;
    items.push({
      post,
      document,
      cover: post.cover_media_id ? covers.get(post.cover_media_id) ?? null : null,
      media: post.kind !== "short" ? new Map() : (shared.get(post.id)?.media ?? media),
      jobs: shared.get(post.id)?.jobs ?? new Map(),
      liked: liked.has(post.id),
      bookmarked: bookmarked.has(post.id),
      reposted: reposted.has(post.id),
      repostCount: post.repost_count + (quotes.get(post.id) ?? 0),
      ...(post.quote_of ? { quoted: quoted.get(post.quote_of) ?? null } : {}),
      readingMinutes: readingMinutes(documentPlainText(document)),
      images: document.blocks.filter((b) => b.type === "image").length,
      audios: document.blocks.filter((b) => b.type === "audio").length,
    });
  }
  return items;
}
