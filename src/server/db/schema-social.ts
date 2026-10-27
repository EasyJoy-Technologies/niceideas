import type { CreatedAt } from "./schema-columns";

/** A post a user saved for later; private to that user (only `post.bookmark_count` is public). */
export interface PostBookmarkTable {
  user_id: string;
  post_id: string;
  created_at: CreatedAt;
}

/** A plain repost: the post shown to the user's followers (no new post); `post.repost_count` counts them. */
export interface PostRepostTable {
  user_id: string;
  post_id: string;
  created_at: CreatedAt;
}
