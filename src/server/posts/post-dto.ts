import { getConfig } from "@/server/config/env";
import type { Post } from "@/server/db/schema";

export type PostDto = {
  id: string;
  slug: string;
  url: string;
  kind: Post["kind"];
  kindLocked: boolean;
  status: Post["status"];
  source: Post["source"];
  sourceRef: string | null;
  syncMode: Post["sync_mode"];
  title: string;
  summary: string;
  summaryLocked: boolean;
  coverMediaId: string | null;
  coverLocked: boolean;
  contentHash: string | null;
  sourceUpdatedAt: string | null;
  publishedAt: string;
  updatedAt: string;
  purgeAfter: string | null;
  likeCount: number;
  bookmarkCount: number;
  commentCount: number;
  commentsMode: Post["comments_mode"];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function postUrl(slug: string): string {
  return `${getConfig().PUBLIC_BASE_URL.replace(/\/+$/, "")}/p/${slug}`;
}

export function toPostDto(p: Post, contentHash: string | null): PostDto {
  return {
    id: p.id,
    slug: p.slug,
    url: postUrl(p.slug),
    kind: p.kind,
    kindLocked: p.kind_locked,
    status: p.status,
    source: p.source,
    sourceRef: p.source_ref,
    syncMode: p.sync_mode,
    title: p.title,
    summary: p.summary,
    summaryLocked: p.summary_locked,
    coverMediaId: p.cover_media_id,
    coverLocked: p.cover_locked,
    contentHash,
    sourceUpdatedAt: iso(p.source_updated_at),
    publishedAt: p.published_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
    purgeAfter: iso(p.purge_after),
    likeCount: p.like_count,
    bookmarkCount: p.bookmark_count,
    commentCount: p.comment_count,
    commentsMode: p.comments_mode,
  };
}
