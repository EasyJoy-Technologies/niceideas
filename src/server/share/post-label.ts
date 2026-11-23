import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "./card";
import type { Translate } from "./locale";

/** Placeholder for a post with no title and no text (images / audio only); shared with the admin pages. */
export const NO_TEXT_KEY = "share.post.noText";

/**
 * A post's name where it is the only text of a link (escaped HTML): the card title, or a muted "(No text)"
 * so the link can still be seen and clicked. `cls`: the placeholder's class (public pages / admin pages).
 */
export function postLabelHtml(t: Translate, post: Pick<Post, "title" | "summary">, cls = "ni-none"): string {
  const title = cardTitle(post);
  return title ? escapeHtml(title) : `<span class="${cls}">${escapeHtml(t(NO_TEXT_KEY))}</span>`;
}
