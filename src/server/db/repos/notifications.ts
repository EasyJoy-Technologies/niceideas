import { sql } from "kysely";
import type { Db } from "../client";

export type NotificationKind = "like" | "comment" | "reply" | "follow";

export type NotificationRow = {
  kind: NotificationKind;
  at: Date;
  actorName: string | null;
  actorHandle: string | null;
  actorAvatar: string | null;
  anonName: string | null;
  postSlug: string | null;
  postTitle: string | null;
  postSummary: string | null;
  excerpt: string | null;
};

const WINDOW_DAYS = 90;

/**
 * Newest events for `userId` (likes / comments on their posts, replies to their
 * comments, new followers), newer than `after` when given. The user's own actions are skipped.
 */
export async function listNotifications(db: Db, userId: string, after: Date | null, limit: number): Promise<NotificationRow[]> {
  const since = after ?? sql<Date>`now() - make_interval(days => ${WINDOW_DAYS})`;
  const [likes, comments, replies, follows] = await Promise.all([
    db
      .selectFrom("post_like as l")
      .innerJoin("post as p", "p.id", "l.post_id")
      .leftJoin("profile as a", "a.user_id", "l.user_id")
      .select(["l.created_at as at", "a.display_name as actorName", "a.handle as actorHandle", "a.avatar_url as actorAvatar", "p.slug as postSlug", "p.title as postTitle", "p.summary as postSummary"])
      .where("p.author_id", "=", userId)
      .where("p.status", "=", "active")
      .where((eb) => eb.or([eb("l.user_id", "is", null), eb("l.user_id", "<>", userId)]))
      .where("l.created_at", ">", since)
      .orderBy("l.created_at", "desc")
      .limit(limit)
      .execute(),
    // Every comment on the user's posts; replies to the user's own comments are labelled "reply".
    db
      .selectFrom("comment as c")
      .innerJoin("post as p", "p.id", "c.post_id")
      .leftJoin("comment as parent", "parent.id", "c.parent_id")
      .leftJoin("profile as a", "a.user_id", "c.author_id")
      .select(["c.created_at as at", "c.body as excerpt", "c.anon_name as anonName", "parent.author_id as parentAuthor", "a.display_name as actorName", "a.handle as actorHandle", "a.avatar_url as actorAvatar", "p.slug as postSlug", "p.title as postTitle", "p.summary as postSummary"])
      .where("p.author_id", "=", userId)
      .where("p.status", "=", "active")
      .where("c.status", "=", "visible")
      .where((eb) => eb.or([eb("c.author_id", "is", null), eb("c.author_id", "<>", userId)]))
      .where("c.created_at", ">", since)
      .orderBy("c.created_at", "desc")
      .limit(limit)
      .execute(),
    // Replies to the user's comments on other people's posts.
    db
      .selectFrom("comment as c")
      .innerJoin("comment as parent", "parent.id", "c.parent_id")
      .innerJoin("post as p", "p.id", "c.post_id")
      .leftJoin("profile as a", "a.user_id", "c.author_id")
      .select(["c.created_at as at", "c.body as excerpt", "c.anon_name as anonName", "a.display_name as actorName", "a.handle as actorHandle", "a.avatar_url as actorAvatar", "p.slug as postSlug", "p.title as postTitle", "p.summary as postSummary"])
      .where("parent.author_id", "=", userId)
      .where("p.author_id", "<>", userId)
      .where("p.status", "=", "active")
      .where("c.status", "=", "visible")
      .where((eb) => eb.or([eb("c.author_id", "is", null), eb("c.author_id", "<>", userId)]))
      .where("c.created_at", ">", since)
      .orderBy("c.created_at", "desc")
      .limit(limit)
      .execute(),
    db
      .selectFrom("follow as f")
      .innerJoin("profile as a", "a.user_id", "f.follower_id")
      .select(["f.created_at as at", "a.display_name as actorName", "a.handle as actorHandle", "a.avatar_url as actorAvatar"])
      .where("f.followee_id", "=", userId)
      .where("a.status", "=", "active")
      .where("f.created_at", ">", since)
      .orderBy("f.created_at", "desc")
      .limit(limit)
      .execute(),
  ]);
  const none = { anonName: null, postSlug: null, postTitle: null, postSummary: null, excerpt: null };
  const rows: NotificationRow[] = [
    ...likes.map((r) => ({ ...none, ...r, kind: "like" as const })),
    ...comments.map(({ parentAuthor, ...r }) => ({ ...r, kind: (parentAuthor === userId ? "reply" : "comment") as NotificationKind })),
    ...replies.map((r) => ({ ...r, kind: "reply" as const })),
    ...follows.map((r) => ({ ...none, ...r, kind: "follow" as const })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export async function markNotificationsSeen(db: Db, userId: string): Promise<void> {
  await db.updateTable("profile").set({ notifications_seen_at: new Date() }).where("user_id", "=", userId).execute();
}
