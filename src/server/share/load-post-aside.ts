import type { Db } from "@/server/db/client";
import type { Media, Profile } from "@/server/db/schema";
import { listFeed, profileStats, type FeedRow, type ProfileStats } from "@/server/db/repos/feed";
import { findMediaByIds } from "@/server/db/repos/media";

const MORE_LIMIT = 3;

export type PostAside = { author: Profile; stats: ProfileStats; more: { post: FeedRow; cover: Media | null }[]; following?: boolean };

/** Right column of a post page on wide screens: author card + the author's other articles. */
export async function loadPostAside(db: Db, author: Profile, currentPostId: string): Promise<PostAside> {
  const [stats, rows] = await Promise.all([
    profileStats(db, author.user_id),
    listFeed(db, { authorId: author.user_id, kind: "article" }, null, MORE_LIMIT + 1),
  ]);
  const others = rows.filter((r) => r.id !== currentPostId).slice(0, MORE_LIMIT);
  const covers = new Map((await findMediaByIds(db, others.flatMap((p) => (p.cover_media_id ? [p.cover_media_id] : [])))).map((m) => [m.id, m]));
  return { author, stats, more: others.map((post) => ({ post, cover: post.cover_media_id ? covers.get(post.cover_media_id) ?? null : null })) };
}
