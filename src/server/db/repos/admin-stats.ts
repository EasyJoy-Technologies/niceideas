import { sql, type RawBuilder } from "kysely";
import type { Db } from "../client";

/** Daily counts, oldest → newest, `days` entries ending today (UTC); missing days are 0. */
async function daily(db: Db, table: string, column: string, days: number, count: RawBuilder<unknown> = sql`count(*)`): Promise<number[]> {
  const t = sql.table(table);
  const c = sql.ref(column);
  const { rows } = await sql<{ n: string }>`
    SELECT coalesce(x.n, 0) AS n
    FROM generate_series((now() AT TIME ZONE 'utc')::date - ${days - 1}::int, (now() AT TIME ZONE 'utc')::date, interval '1 day') AS d
    LEFT JOIN (
      SELECT (${c} AT TIME ZONE 'utc')::date AS day, ${count} AS n FROM ${t}
      WHERE ${c} >= (now() AT TIME ZONE 'utc')::date - ${days - 1}::int GROUP BY 1
    ) x ON x.day = d::date
    ORDER BY d`.execute(db);
  return rows.map((r) => Number(r.n));
}

export type OverviewSeries = { posts: number[]; authors: number[]; users: number[]; likes: number[]; comments: number[]; reports: number[] };

/** 14-day series of the overview cards (value = last 7 days, compared with the 7 before). */
export async function overviewSeries(db: Db): Promise<OverviewSeries> {
  const [posts, authors, users, likes, comments, reports] = await Promise.all([
    daily(db, "post", "published_at", 14),
    daily(db, "post", "published_at", 14, sql`count(DISTINCT author_id)`),
    daily(db, "profile", "created_at", 14),
    daily(db, "post_like", "created_at", 14),
    daily(db, "comment", "created_at", 14),
    daily(db, "report", "created_at", 14),
  ]);
  return { posts, authors, users, likes, comments, reports };
}

/** Distinct authors in the last 7 days and the 7 days before (a sum of daily values would double count). */
export async function authorsWeekly(db: Db): Promise<{ now: number; prev: number }> {
  const { rows } = await sql<{ now: string; prev: string }>`
    SELECT count(DISTINCT author_id) FILTER (WHERE published_at >= now() - interval '7 days') AS now,
           count(DISTINCT author_id) FILTER (WHERE published_at < now() - interval '7 days') AS prev
    FROM post WHERE published_at >= now() - interval '14 days'`.execute(db);
  return { now: Number(rows[0]?.now ?? 0), prev: Number(rows[0]?.prev ?? 0) };
}

export const SOURCE_CLASSES = ["nicenote_intl", "nicenote_cn", "web", "api"] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

/** New posts per day and source class (third-party apps grouped), last `days` days. */
export async function postsBySource(db: Db, days: number): Promise<Record<SourceClass, number[]>> {
  const { rows } = await sql<{ i: number; cls: SourceClass; n: string }>`
    SELECT ((published_at AT TIME ZONE 'utc')::date - ((now() AT TIME ZONE 'utc')::date - ${days - 1}::int))::int AS i,
           CASE WHEN source LIKE 'api:%' THEN 'api' ELSE source END AS cls, count(*) AS n
    FROM post WHERE published_at >= (now() AT TIME ZONE 'utc')::date - ${days - 1}::int GROUP BY 1, 2`.execute(db);
  const out = Object.fromEntries(SOURCE_CLASSES.map((c) => [c, new Array<number>(days).fill(0)])) as Record<SourceClass, number[]>;
  for (const r of rows) if (out[r.cls] && r.i >= 0 && r.i < days) out[r.cls][r.i] = Number(r.n);
  return out;
}

export type TopPost = { slug: string; title: string; summary: string; kind: string; source: string; handle: string; likes: number; comments: number; recent: number };

/** Live posts with the most likes received in the last 7 days. */
export async function topPosts(db: Db, limit: number): Promise<TopPost[]> {
  const { rows } = await sql<TopPost>`
    SELECT p.slug, p.title, p.summary, p.kind, p.source, pr.handle, p.like_count AS likes, p.comment_count AS comments, count(l.post_id)::int AS recent
    FROM post p JOIN profile pr ON pr.user_id = p.author_id
    LEFT JOIN post_like l ON l.post_id = p.id AND l.created_at >= now() - interval '7 days'
    WHERE p.status = 'active'
    GROUP BY p.id, pr.handle
    ORDER BY recent DESC, p.like_count DESC, p.published_at DESC
    LIMIT ${limit}`.execute(db);
  return rows;
}

export type TodoCounts = { openReports: number; oldestReport: Date | null; hiddenComments: number; bansEnding: number };

export async function todoCounts(db: Db): Promise<TodoCounts> {
  const { rows } = await sql<{ open: string; oldest: Date | null; hidden: string; ending: string }>`
    SELECT (SELECT count(DISTINCT (post_id, comment_id)) FROM report WHERE status = 'open') AS open,
           (SELECT min(created_at) FROM report WHERE status = 'open') AS oldest,
           (SELECT count(*) FROM comment WHERE status = 'hidden') AS hidden,
           (SELECT count(*) FROM visitor_ban WHERE expires_at > now() AND expires_at < now() + interval '7 days') AS ending`.execute(db);
  const r = rows[0];
  return { openReports: Number(r?.open ?? 0), oldestReport: r?.oldest ?? null, hiddenComments: Number(r?.hidden ?? 0), bansEnding: Number(r?.ending ?? 0) };
}

export type Health = { dbMs: number; dbBytes: number; mediaBytes: number; posts: number };

export async function systemHealth(db: Db): Promise<Health> {
  const start = performance.now();
  await sql`SELECT 1`.execute(db);
  const dbMs = Math.round(performance.now() - start);
  const { rows } = await sql<{ db: string; media: string | null; posts: string }>`
    SELECT pg_database_size(current_database()) AS db, (SELECT sum(byte_size) FROM media) AS media,
           (SELECT count(*) FROM post WHERE status = 'active') AS posts`.execute(db);
  return { dbMs, dbBytes: Number(rows[0]?.db ?? 0), mediaBytes: Number(rows[0]?.media ?? 0), posts: Number(rows[0]?.posts ?? 0) };
}
