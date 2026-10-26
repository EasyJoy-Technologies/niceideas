import type { Post, PostVisibility } from "@/server/db/schema";

/**
 * Post visibility (plan docs/plan/2026-10-26-private-theme-guidelines.md C): a private post is seen by
 * its author only — to everyone else it does not exist (404) — and its media stay in the private store.
 */
export const VISIBILITIES: readonly PostVisibility[] = ["public", "private"];

export function isVisibility(value: unknown): value is PostVisibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

/** Shown to everyone with its media in the public store (an active author is checked separately). */
export function isPublicLive(post: Pick<Post, "status" | "visibility">): boolean {
  return post.status === "active" && post.visibility === "public";
}

/** Whether `viewerId` may see the post at all (public, or their own). */
export function canSee(post: Pick<Post, "visibility" | "author_id">, viewerId: string | null | undefined): boolean {
  return post.visibility === "public" || (!!viewerId && viewerId === post.author_id);
}
