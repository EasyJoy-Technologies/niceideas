import type { Post, PostVisibility } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon, type IconName } from "./icons";

/**
 * How a post's visibility shows on pages (plan docs/plan/2026-11-10-audience-visibility.md): one icon and one
 * label per value, used by the compose picker, the author's menu, feed-card marks and the post-page note.
 */
export const VISIBILITY_ICONS: Record<PostVisibility, IconName> = { public: "globe", followers: "users", friends: "userCheck", private: "lock" };

const LABEL_KEYS: Record<PostVisibility, string> = {
  public: "share.visibility.public",
  followers: "share.visibility.followers",
  friends: "share.visibility.friends",
  private: "share.post.private",
};

const HINT_KEYS: Record<PostVisibility, string> = {
  public: "share.visibility.publicHint",
  followers: "share.visibility.followersHint",
  friends: "share.visibility.friendsHint",
  private: "share.visibility.privateHint",
};

const NOTE_KEYS: Partial<Record<PostVisibility, string>> = {
  followers: "share.post.followersNote",
  friends: "share.post.friendsNote",
  private: "share.post.privateNote",
};

export const visibilityLabel = (ctx: ChromeContext, v: PostVisibility) => ctx.intl.t(LABEL_KEYS[v]);
export const visibilityHint = (ctx: ChromeContext, v: PostVisibility) => ctx.intl.t(HINT_KEYS[v]);

/** Mark after the time in a feed card's meta line (posts that are not public). */
export function visibilityMark(ctx: ChromeContext, post: Pick<Post, "visibility">): string {
  if (post.visibility === "public") return "";
  return `<i class="ni-dot"></i><span class="ni-private">${icon(VISIBILITY_ICONS[post.visibility])}${escapeHtml(visibilityLabel(ctx, post.visibility))}</span>`;
}

/** Short note above a post that is not public (its author and everyone allowed to see it). */
export function visibilityNote(ctx: ChromeContext, post: Pick<Post, "visibility">): string {
  const key = NOTE_KEYS[post.visibility];
  return key ? `<p class="ni-private-note" role="note">${icon(VISIBILITY_ICONS[post.visibility])}<span>${escapeHtml(ctx.intl.t(key))}</span></p>` : "";
}
