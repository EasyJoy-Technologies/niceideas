import type { Db } from "@/server/db/client";
import type { Post, PostVisibility } from "@/server/db/schema";
import { followRelation, type FollowRelation } from "@/server/db/repos/follows";

/**
 * Post visibility (plans docs/plan/2026-10-26-private-theme-guidelines.md C, docs/plan/2026-11-10-audience-visibility.md):
 * public; followers only (the author's followers); friends only (mutual follows); private (the author only).
 * Decided at each view from the follow relationship as it is now. Only public posts are listed publicly and
 * keep their media in the public store; the others' media stay private (served after this check).
 * List queries use the same rule in SQL: db/repos/post-access.ts.
 */
export const VISIBILITIES: readonly PostVisibility[] = ["public", "followers", "friends", "private"];

/** Posts seen by part of the author's audience (followers / friends). */
export type Audience = Extract<PostVisibility, "followers" | "friends">;

export function isVisibility(value: unknown): value is PostVisibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

export const isAudience = (v: PostVisibility): v is Audience => v === "followers" || v === "friends";

/** Shown to everyone with its media in the public store (an active author is checked separately). */
export function isPublicLive(post: Pick<Post, "status" | "visibility">): boolean {
  return post.status === "active" && post.visibility === "public";
}

type Viewable = Pick<Post, "visibility" | "author_id">;

/** The rule, given the viewer's follow relationship with the author (`null`: not needed / not signed in). */
export function canSeeWith(post: Viewable, viewerId: string | null | undefined, rel: FollowRelation | null): boolean {
  if (post.visibility === "public") return true;
  if (!viewerId) return false;
  if (viewerId === post.author_id) return true;
  if (post.visibility === "followers") return !!rel?.follows;
  if (post.visibility === "friends") return !!rel?.follows && !!rel.followedBack;
  return false;
}

/** Whether `viewerId` may see the post now (reads the follow relationship only for followers / friends posts). */
export async function canSee(db: Db, post: Viewable, viewerId: string | null | undefined): Promise<boolean> {
  if (post.visibility === "public" || !viewerId || viewerId === post.author_id || !isAudience(post.visibility)) return canSeeWith(post, viewerId, null);
  return canSeeWith(post, viewerId, await followRelation(db, viewerId, post.author_id));
}
