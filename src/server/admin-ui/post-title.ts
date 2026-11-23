import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { postLabelHtml } from "@/server/share/post-label";
import type { AdminContext } from "./shell";

/** What the admin pages need to name a post. */
export type AdminTitled = Pick<Post, "title" | "summary" | "current_revision_id">;

/**
 * A post's title in the admin pages (escaped HTML): the card title, or a muted placeholder when the post has no
 * text, so its link can still be seen and clicked. "No content": it never received any (a NiceNote share deleted
 * or still waiting for its first push). "No text": images or audio only (same wording as the public pages).
 */
export function adminPostTitle(ctx: AdminContext, p: AdminTitled): string {
  if (!p.current_revision_id && !p.title && !p.summary) return `<span class="ad-none">${escapeHtml(ctx.intl.t("admin.posts.noContent"))}</span>`;
  return postLabelHtml(ctx.intl.t, p, "ad-none");
}
