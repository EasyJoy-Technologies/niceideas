import { sql } from "kysely";
import type { Db } from "../client";
import type { Profile } from "../schema";
import type { FeedRow } from "./feed";

/** Authors with live posts, most liked first; excludes the viewer and authors they follow. */
export async function suggestedAuthors(db: Db, viewerId: string | null, limit: number): Promise<Profile[]> {
  let q = db
    .selectFrom("profile")
    .innerJoin(
      (eb) =>
        eb.selectFrom("post").select(["author_id", sql<number>`sum(like_count)`.as("likes"), sql<Date>`max(published_at)`.as("last")]).where("status", "=", "active").groupBy("author_id").as("s"),
      (join) => join.onRef("s.author_id", "=", "profile.user_id"),
    )
    .selectAll("profile")
    .where("profile.status", "=", "active");
  if (viewerId) {
    q = q
      .where("profile.user_id", "<>", viewerId)
      .where((eb) => eb.not(eb.exists(eb.selectFrom("follow").select("follower_id").where("follower_id", "=", viewerId).whereRef("followee_id", "=", "profile.user_id"))));
  }
  return q.orderBy("s.likes", "desc").orderBy("s.last", "desc").limit(limit).execute();
}

/** Most liked live articles of the last `days` days. */
export async function hotArticles(db: Db, days: number, limit: number): Promise<FeedRow[]> {
  return db
    .selectFrom("post")
    .innerJoin("profile", "profile.user_id", "post.author_id")
    .selectAll("post")
    .select(["profile.handle as author_handle", "profile.display_name as author_name", "profile.avatar_url as author_avatar"])
    .where("post.status", "=", "active")
    .where("profile.status", "=", "active")
    .where("post.kind", "=", "article")
    .where("post.published_at", ">", sql<Date>`now() - make_interval(days => ${days})`)
    .orderBy("post.like_count", "desc")
    .orderBy("post.published_at", "desc")
    .limit(limit)
    .execute();
}
