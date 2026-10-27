import type { CreatedAt } from "./schema-columns";

/** A post a user saved for later; private to that user (only `post.bookmark_count` is public). */
export interface PostBookmarkTable {
  user_id: string;
  post_id: string;
  created_at: CreatedAt;
}
