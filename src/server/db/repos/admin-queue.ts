import { sql } from "kysely";
import type { Db } from "../client";
import type { Report } from "../schema";

export type ReportTab = "open" | "resolved" | "dismissed";
export type ReportKind = "all" | "posts" | "comments";

/** All reports on one item (post, or comment) with the same status, merged into one row. */
export type ReportGroup = {
  id: string; post_id: string; comment_id: string | null; n: number; reasons: string[]; first_at: Date; last_at: Date;
  slug: string; title: string; summary: string; kind: string; post_status: string;
  comment_body: string | null; comment_status: string | null; author_handle: string | null; anon_name: string | null; comment_author: string | null;
};

/** Report groups of a tab: open ones oldest first, handled ones newest first. */
export async function listReportGroups(db: Db, tab: ReportTab, kind: ReportKind, limit: number): Promise<ReportGroup[]> {
  const only = kind === "posts" ? sql`AND r.comment_id IS NULL` : kind === "comments" ? sql`AND r.comment_id IS NOT NULL` : sql``;
  const order = tab === "open" ? sql`first_at ASC` : sql`last_at DESC`;
  const { rows } = await sql<ReportGroup>`
    SELECT (array_agg(r.id ORDER BY r.created_at))[1] AS id, r.post_id, r.comment_id, count(*)::int AS n,
           array_agg(DISTINCT r.reason) AS reasons, min(r.created_at) AS first_at, max(coalesce(r.resolved_at, r.created_at)) AS last_at,
           p.slug, p.title, p.summary, p.kind, p.status AS post_status, c.body AS comment_body, c.status AS comment_status,
           CASE WHEN r.comment_id IS NULL THEN pa.handle ELSE ca.handle END AS author_handle, c.anon_name, c.author_id AS comment_author
    FROM report r JOIN post p ON p.id = r.post_id LEFT JOIN comment c ON c.id = r.comment_id
    LEFT JOIN profile pa ON pa.user_id = p.author_id LEFT JOIN profile ca ON ca.user_id = c.author_id
    WHERE r.status = ${tab} ${only}
    GROUP BY r.post_id, r.comment_id, p.id, c.id, pa.handle, ca.handle
    ORDER BY ${order} LIMIT ${limit}`.execute(db);
  return rows;
}

export type ReportLine = { id: string; reason: string; detail: string; created_at: Date; reporter_handle: string | null };

/** Every report on the same item with the same status (detail panel). */
export async function reportsOfGroup(db: Db, r: Report): Promise<ReportLine[]> {
  let q = db
    .selectFrom("report as r")
    .leftJoin("profile as pr", "pr.user_id", "r.reporter_id")
    .select(["r.id", "r.reason", "r.detail", "r.created_at", "pr.handle as reporter_handle"])
    .where("r.post_id", "=", r.post_id)
    .where("r.status", "=", r.status)
    .orderBy("r.created_at", "desc");
  q = r.comment_id ? q.where("r.comment_id", "=", r.comment_id) : q.where("r.comment_id", "is", null);
  return q.execute();
}

/** Open reports on the item of `r` (closed together when the item is handled). */
export async function openReportsOfTarget(db: Db, r: Report): Promise<Report[]> {
  let q = db.selectFrom("report").selectAll().where("post_id", "=", r.post_id).where("status", "=", "open");
  q = r.comment_id ? q.where("comment_id", "=", r.comment_id) : q.where("comment_id", "is", null);
  return q.execute();
}

export async function countOpenReportGroups(db: Db): Promise<number> {
  const { rows } = await sql<{ n: string }>`SELECT count(DISTINCT (post_id, comment_id)) AS n FROM report WHERE status = 'open'`.execute(db);
  return Number(rows[0]?.n ?? 0);
}

/** Comments by the same browser (or network) in the last 7 days — context for a ban. */
export async function recentCommentsOfVisitor(db: Db, visitorKey: string | null, ipHash: string): Promise<number> {
  const { rows } = await sql<{ n: string }>`
    SELECT count(*) AS n FROM comment WHERE created_at > now() - interval '7 days'
    AND ${visitorKey ? sql`visitor_key = ${visitorKey}` : sql`ip_hash = ${ipHash}`}`.execute(db);
  return Number(rows[0]?.n ?? 0);
}

export async function findReport(db: Db, id: string): Promise<Report | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return db.selectFrom("report").selectAll().where("id", "=", id).executeTakeFirst();
}
