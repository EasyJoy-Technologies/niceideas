import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "@/server/share/card";
import type { AdminContext } from "./shell";

/** What the admin pages need to name a post. */
export type AdminTitled = Pick<Post, "title" | "summary" | "current_revision_id">;

/**
 * A post's title in the admin pages (escaped HTML): the card title, or a muted placeholder when the post has no
 * text, so its link can still be seen and clicked. "No content": it never received any (a NiceNote share deleted
 * or still waiting for its first push). "No text": images or audio only.
 */
export function adminPostTitle(ctx: AdminContext, p: AdminTitled): string {
  const title = cardTitle(p);
  if (title) return escapeHtml(title);
  const key = p.current_revision_id ? "admin.posts.noText" : "admin.posts.noContent";
  return `<span class="ad-none">${escapeHtml(ctx.intl.t(key))}</span>`;
}
