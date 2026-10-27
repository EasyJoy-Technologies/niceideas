import type { Db } from "@/server/db/client";
import { addRepost, liveQuoteCounts, removeRepost } from "@/server/db/repos/reposts";
import { interactivePost } from "./target";

export type RepostState = { reposted: boolean; repostCount: number };

/**
 * Repost / undo for a signed-in user (no new post; their followers see the post with "X reposted").
 * Live public posts only (private ones look nonexistent, offline ones are gone). The count returned
 * is the one shown: plain reposts plus live quotes.
 */
export async function setRepost(db: Db, slug: string, userId: string, on: boolean): Promise<RepostState> {
  const post = await interactivePost(db, slug);
  const plain = on ? await addRepost(db, userId, post.id) : await removeRepost(db, userId, post.id);
  const quotes = (await liveQuoteCounts(db, [post.id])).get(post.id) ?? 0;
  return { reposted: on, repostCount: plain + quotes };
}
