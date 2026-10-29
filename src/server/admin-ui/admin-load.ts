import { findComment } from "@/server/db/repos/comments";
import type { Db } from "@/server/db/client";
import { listActiveBans, listAdminComments, listAdminPosts, listAudit } from "@/server/db/repos/admin-lists";
import { findReport, listReportGroups, recentCommentsOfVisitor, reportsOfGroup, type ReportKind, type ReportTab } from "@/server/db/repos/admin-queue";
import { authorsWeekly, overviewSeries, postsBySource, systemHealth, todoCounts, topPosts } from "@/server/db/repos/admin-stats";
import type { CommentStatus, PostStatus } from "@/server/db/schema";
import { renderBans, renderAudit, renderComments, renderPosts } from "./lists-page";
import { renderOverview } from "./overview-page";
import { renderApps } from "./apps-page";
import { listApiClients } from "@/server/db/repos/api-clients";
import { countPostsByApp, listSourceApps } from "@/server/db/repos/source-apps";
import { PAGE_SIZE } from "./parts";
import { renderReports, type ReportsView } from "./reports-page";
import { adminPostSourceFilter, parseAdminSource } from "./source-class";
import type { AdminContext, AdminSection } from "./shell";

const QUEUE_LIMIT = 100;
/** Days in the overview's posts-by-source chart. */
const SOURCE_DAYS = 30;
const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | null => ((allowed as readonly string[]).includes(v ?? "") ? (v as T) : null);
const offsetOf = (url: URL) => Math.max(0, Math.min(10_000, Math.floor(Number(url.searchParams.get("o")) || 0)));
const noticeOf = (url: URL) => pick(url.searchParams.get("n"), ["done", "failed"] as const);
const queryOf = (url: URL) => (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

async function reports(db: Db, ctx: AdminContext, url: URL): Promise<string> {
  const tab: ReportTab = pick(url.searchParams.get("tab"), ["resolved", "dismissed"] as const) ?? "open";
  const kind: ReportKind = pick(url.searchParams.get("k"), ["posts", "comments"] as const) ?? "all";
  const groups = await listReportGroups(db, tab, kind, QUEUE_LIMIT);
  const wanted = url.searchParams.get("r");
  // Open queue: the oldest item is selected so the moderator can start right away.
  const group = groups.find((g) => g.id === wanted) ?? (tab === "open" ? groups[0] : undefined);
  let selected: ReportsView["selected"] = null;
  const report = group ? await findReport(db, group.id) : undefined;
  if (group && report) {
    const comment = group.comment_id ? ((await findComment(db, group.comment_id)) ?? null) : null;
    const [lines, visitorRecent] = await Promise.all([
      reportsOfGroup(db, report),
      comment && !comment.author_id ? recentCommentsOfVisitor(db, comment.visitor_key, comment.ip_hash) : Promise.resolve(0),
    ]);
    selected = { group, report, lines, comment, visitorRecent };
  }
  return renderReports(ctx, { tab, kind, groups, counts: { open: ctx.openReports, resolved: 0, dismissed: 0 }, selected, notice: noticeOf(url) });
}

/** Loads the data of one admin section and renders it. */
export async function loadSection(db: Db, ctx: AdminContext, section: AdminSection, url: URL): Promise<string> {
  const offset = offsetOf(url);
  switch (section) {
    case "overview": {
      const [series, authors, byClass, top, todo, health] = await Promise.all([
        overviewSeries(db), authorsWeekly(db), postsBySource(db, SOURCE_DAYS), topPosts(db, 5), todoCounts(db), systemHealth(db),
      ]);
      return renderOverview(ctx, { series, authors, bySource: { days: SOURCE_DAYS, byClass }, top, todo, health });
    }
    case "reports":
      return reports(db, ctx, url);
    case "posts": {
      const status = pick<PostStatus>(url.searchParams.get("s"), ["active", "preparing", "removed", "unpublished", "author_deleting"]);
      const source = parseAdminSource(url.searchParams.get("src"));
      const query = queryOf(url);
      const page = await listAdminPosts(db, { status, source: source && adminPostSourceFilter(source), query, offset, limit: PAGE_SIZE });
      return renderPosts(ctx, { status, source, query, offset, page, notice: noticeOf(url) });
    }
    case "apps": {
      const [own, clients, posts] = await Promise.all([listSourceApps(db), listApiClients(db), countPostsByApp(db)]);
      return renderApps(ctx, { own, clients, posts, notice: noticeOf(url) });
    }
    case "comments": {
      const status = pick<CommentStatus>(url.searchParams.get("s"), ["visible", "hidden", "deleted"]);
      const query = queryOf(url);
      return renderComments(ctx, { status, query, offset, page: await listAdminComments(db, { status, query, offset, limit: PAGE_SIZE }), notice: noticeOf(url) });
    }
    case "bans":
      return renderBans(ctx, { offset, page: await listActiveBans(db, offset, PAGE_SIZE), notice: noticeOf(url) });
    case "audit":
      return renderAudit(ctx, { offset, page: await listAudit(db, offset, PAGE_SIZE) });
  }
}
