import { sql } from "kysely";
import type { Db } from "../client";
import type { CommentStatus, ModerationActionKind, PostStatus } from "../schema";
import { containsPattern } from "./feed";

/** Admin lists page with offset paging; `limit + 1` rows are read to know whether there is more. */
export type Page<T> = { rows: T[]; more: boolean };
const paged = <T>(rows: T[], limit: number): Page<T> => ({ rows: rows.slice(0, limit), more: rows.length > limit });

export type AdminPostRow = { id: string; slug: string; title: string; summary: string; kind: string; source: string; status: PostStatus; like_count: number; comment_count: number; published_at: Date; handle: string };

/** Posts by status; `query`: "@handle", a slug, or text of the title / body. */
export async function listAdminPosts(db: Db, f: { status: PostStatus | null; query: string; offset: number; limit: number }): Promise<Page<AdminPostRow>> {
  let q = db
    .selectFrom("post as p")
    .innerJoin("profile as pr", "pr.user_id", "p.author_id")
    .select(["p.id", "p.slug", "p.title", "p.summary", "p.kind", "p.source", "p.status", "p.like_count", "p.comment_count", "p.published_at", "pr.handle"]);
  if (f.status) q = q.where("p.status", "=", f.status);
  const query = f.query.trim();
  if (query.startsWith("@")) q = q.where("pr.handle", "=", query.slice(1).toLowerCase());
  else if (query) q = q.where((eb) => eb.or([eb("p.slug", "=", query.toLowerCase()), eb("p.search_text", "ilike", containsPattern(query))]));
  const rows = await q.orderBy("p.published_at", "desc").orderBy("p.id").offset(f.offset).limit(f.limit + 1).execute();
  return paged(rows, f.limit);
}

export type AdminCommentRow = { id: string; body: string; status: CommentStatus; created_at: Date; anon_name: string | null; author_id: string | null; handle: string | null; slug: string; title: string; summary: string };

export async function listAdminComments(db: Db, f: { status: CommentStatus | null; query: string; offset: number; limit: number }): Promise<Page<AdminCommentRow>> {
  let q = db
    .selectFrom("comment as c")
    .innerJoin("post as p", "p.id", "c.post_id")
    .leftJoin("profile as pr", "pr.user_id", "c.author_id")
    .select(["c.id", "c.body", "c.status", "c.created_at", "c.anon_name", "c.author_id", "pr.handle", "p.slug", "p.title", "p.summary"]);
  if (f.status) q = q.where("c.status", "=", f.status);
  if (f.query.trim()) q = q.where("c.body", "ilike", containsPattern(f.query.trim()));
  const rows = await q.orderBy("c.created_at", "desc").orderBy("c.id").offset(f.offset).limit(f.limit + 1).execute();
  return paged(rows, f.limit);
}

export type AdminBanRow = { kind: "visitor" | "ip"; key_hash: string; reason: string; created_at: Date; expires_at: Date | null; by_handle: string | null; created_by: string };

/** Bans in force (no end, or ending later), newest first. */
export async function listActiveBans(db: Db, offset: number, limit: number): Promise<Page<AdminBanRow>> {
  const rows = await db
    .selectFrom("visitor_ban as b")
    .leftJoin("profile as pr", "pr.user_id", "b.created_by")
    .select(["b.kind", "b.key_hash", "b.reason", "b.created_at", "b.expires_at", "b.created_by", "pr.handle as by_handle"])
    .where((eb) => eb.or([eb("b.expires_at", "is", null), eb("b.expires_at", ">", sql<Date>`now()`)]))
    .orderBy("b.created_at", "desc")
    .offset(offset)
    .limit(limit + 1)
    .execute();
  return paged(rows, limit);
}

export type AuditRow = { id: string; action: ModerationActionKind; reason: string; detail: string; created_at: Date; actor_id: string; actor_handle: string | null; slug: string | null; comment_id: string | null };

export async function listAudit(db: Db, offset: number, limit: number): Promise<Page<AuditRow>> {
  const rows = await db
    .selectFrom("moderation_action as m")
    .leftJoin("profile as pr", "pr.user_id", "m.actor_id")
    .leftJoin("post as p", "p.id", "m.post_id")
    .select(["m.id", "m.action", "m.reason", "m.detail", "m.created_at", "m.actor_id", "pr.handle as actor_handle", "p.slug", "m.comment_id"])
    .orderBy("m.created_at", "desc")
    .orderBy("m.id")
    .offset(offset)
    .limit(limit + 1)
    .execute();
  return paged(rows, limit);
}
