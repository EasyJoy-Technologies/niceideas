import type { Db } from "../client";
import type { Report } from "../schema";

export type ReviewItem = {
  id: string;
  reason: string;
  detail: string;
  created_at: Date;
  comment_id: string | null;
  slug: string;
  title: string;
  summary: string;
  post_status: string;
  comment_body: string | null;
  comment_status: string | null;
};

/** Open reports with their post / comment, oldest first (admin queue). */
export async function listOpenReportsForReview(db: Db, limit: number): Promise<ReviewItem[]> {
  return db
    .selectFrom("report as r")
    .innerJoin("post as p", "p.id", "r.post_id")
    .leftJoin("comment as c", "c.id", "r.comment_id")
    .select(["r.id", "r.reason", "r.detail", "r.created_at", "r.comment_id", "p.slug", "p.title", "p.summary", "p.status as post_status", "c.body as comment_body", "c.status as comment_status"])
    .where("r.status", "=", "open")
    .orderBy("r.created_at", "asc")
    .limit(limit)
    .execute();
}

export async function findReport(db: Db, id: string): Promise<Report | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return db.selectFrom("report").selectAll().where("id", "=", id).executeTakeFirst();
}
