import type { Db } from "@/server/db/client";
import { addBookmark, removeBookmark } from "@/server/db/repos/bookmarks";
import { ApiError } from "@/server/http/errors";
import type { Actor } from "./actor";
import { interactivePost } from "./target";

/**
 * Save / unsave a post for the signed-in viewer (bookmarks are account-only and private; the post
 * shows only how many people saved it). Guests get 401 `auth.required` (the page sends them to sign-in).
 */
export async function setBookmark(db: Db, slug: string, actor: Actor, saved: boolean): Promise<{ bookmarked: boolean; bookmarkCount: number }> {
  if (!actor.viewer) throw new ApiError("auth.required", 401);
  const post = await interactivePost(db, slug);
  const count = saved ? await addBookmark(db, actor.viewer.user_id, post.id) : await removeBookmark(db, actor.viewer.user_id, post.id);
  return { bookmarked: saved, bookmarkCount: count };
}
