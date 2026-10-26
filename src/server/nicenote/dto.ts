import type { Post } from "@/server/db/schema";
import { postUrl } from "@/server/posts/post-dto";

/** `post` object of the source API (contract niceideas-share.md §3.7). */
export type SourcePostDto = {
  id: string;
  shareId: string | null;
  url: string;
  status: Post["status"];
  mediaState: Post["media_state"];
  syncMode: Post["sync_mode"];
  commentsMode: Post["comments_mode"];
  /** public / private (author only), v1.0.75. */
  visibility: Post["visibility"];
  sourceRevision: number | null;
  updatedAt: string;
};

export function toSourcePostDto(p: Post): SourcePostDto {
  return {
    id: p.id,
    shareId: p.share_id,
    url: postUrl(p.slug),
    status: p.status,
    mediaState: p.media_state,
    syncMode: p.sync_mode,
    commentsMode: p.comments_mode,
    visibility: p.visibility,
    sourceRevision: p.source_revision === null ? null : Number(p.source_revision),
    updatedAt: p.updated_at.toISOString(),
  };
}
