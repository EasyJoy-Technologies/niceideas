import type { Db } from "@/server/db/client";
import type { Media, MediaJobState } from "@/server/db/schema";
import { findRevisions, listFeed, type FeedCursor, type FeedFilter, type FeedRow } from "@/server/db/repos/feed";
import { likedAmong, POST_LIKE } from "@/server/db/repos/likes";
import { findMediaByIds } from "@/server/db/repos/media";
import { documentPlainText } from "@/server/documents/derive";
import { documentMediaKeys, isSourceDocument, parseStoredDocument, type StoredDocument } from "@/server/documents/stored";
import { loadDocumentMedia } from "./document-media";

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
const cursorOf = (p: FeedRow) => `${p.published_at.getTime()}_${p.id}`;

/** One page of feed cards with everything the renderer needs (documents, covers, visitor likes). */
export async function loadFeed(db: Db, filter: FeedFilter, cursor: FeedCursor | null, visitorKey: string | null): Promise<FeedPage> {
  const rows = await listFeed(db, filter, cursor, FEED_PAGE_SIZE + 1);
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const revisions = new Map((await findRevisions(db, page.flatMap((p) => (p.current_revision_id ? [p.current_revision_id] : [])))).map((r) => [r.id, r]));
  const covers = new Map((await findMediaByIds(db, page.flatMap((p) => (p.cover_media_id ? [p.cover_media_id] : [])))).map((m) => [m.id, m]));
  const documents = new Map(page.map((p) => [p.id, p.current_revision_id ? revisions.get(p.current_revision_id) : undefined] as const).flatMap(([id, r]) => (r ? [[id, parseStoredDocument(r.document)] as const] : [])));
  const shorts = page.filter((p) => p.kind === "short" && documents.has(p.id));
  // API documents: one query by media id; NiceNote shares: by ref per author.
  const media = new Map((await findMediaByIds(db, shorts.flatMap((p) => (isSourceDocument(documents.get(p.id)!) ? [] : documentMediaKeys(documents.get(p.id)!))))).map((m) => [m.id, m]));
  const shared = new Map(await Promise.all(shorts.filter((p) => isSourceDocument(documents.get(p.id)!)).map(async (p) => [p.id, await loadDocumentMedia(db, p.author_id, documents.get(p.id)!)] as const)));
  const liked = visitorKey ? await likedAmong(db, POST_LIKE, page.map((p) => p.id), visitorKey) : new Set<string>();
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
      readingMinutes: readingMinutes(documentPlainText(document)),
      images: document.blocks.filter((b) => b.type === "image").length,
      audios: document.blocks.filter((b) => b.type === "audio").length,
    });
  }
  return { items, next: rows.length > FEED_PAGE_SIZE ? cursorOf(page[page.length - 1]) : null };
}
