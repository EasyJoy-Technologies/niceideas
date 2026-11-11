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
  /**
   * public / private, v1.0.75: still only these two, so existing clients keep working — followers-only and
   * friends-only posts (web only, v1.0.93) report `private` ("not public"). `audience`: the exact value.
   */
  visibility: LegacyVisibility;
  audience: Post["visibility"];
  sourceRevision: number | null;
  updatedAt: string;
};

type LegacyVisibility = "public" | "private";

/** `visibility` (public / private) and `audience` (exact) of the post object and the `visibility_changed` event. */
export function visibilityFields(p: Pick<Post, "visibility">): { visibility: LegacyVisibility; audience: Post["visibility"] } {
  return { visibility: p.visibility === "public" ? "public" : "private", audience: p.visibility };
}

export function toSourcePostDto(p: Post): SourcePostDto {
  return {
    id: p.id,
    shareId: p.share_id,
    url: postUrl(p.slug),
    status: p.status,
    mediaState: p.media_state,
    syncMode: p.sync_mode,
    commentsMode: p.comments_mode,
    ...visibilityFields(p),
    sourceRevision: p.source_revision === null ? null : Number(p.source_revision),
    updatedAt: p.updated_at.toISOString(),
  };
}
