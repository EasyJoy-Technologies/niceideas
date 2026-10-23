import type { ReportGroup, ReportKind, ReportLine, ReportTab } from "@/server/db/repos/admin-queue";
import type { Comment, Report } from "@/server/db/schema";
import { canModerate } from "@/server/admin/roles";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "@/server/share/card";
import { icon } from "@/server/share/icons";
import { banFields, emptyRow, hiddenFields, notice, reasonField, tabs, when, withQuery } from "./parts";
import { renderAdmin, type AdminContext } from "./shell";

export type ReportsView = {
  tab: ReportTab; kind: ReportKind; groups: ReportGroup[]; counts: Record<ReportTab, number>;
  selected: { group: ReportGroup; report: Report; lines: ReportLine[]; comment: Comment | null; visitorRecent: number } | null;
  notice: "done" | "failed" | null;
};

const e = escapeHtml;
const BASE = "/admin/reports";

function itemText(g: ReportGroup): string {
  return g.comment_id ? (g.comment_body ?? "") : cardTitle(g);
}

function who(ctx: AdminContext, g: ReportGroup): string {
  if (g.author_handle) return `@${e(g.author_handle)}`;
  return e(g.anon_name || ctx.intl.t("share.comments.anonymous"));
}

function listRow(ctx: AdminContext, v: ReportsView, g: ReportGroup): string {
  const { t } = ctx.intl;
  const href = withQuery(BASE, { tab: v.tab === "open" ? "" : v.tab, k: v.kind === "all" ? "" : v.kind, r: g.id });
  const on = v.selected?.group.id === g.id ? ' aria-current="true"' : "";
  const reasons = g.reasons.map((r) => `<span class="ad-pill ${r === "illegal" ? "bad" : "warn"}">${e(t(`share.report.reason.${r}`))}</span>`).join("");
  const kind = t(g.comment_id ? "admin.kind.comment" : "admin.kind.post");
  return (
    `<a class="ad-rr" href="${e(href)}"${on}><span class="ad-rr-i">${icon(g.comment_id ? "comment" : "fileText")}</span>` +
    `<span class="ad-rr-t"><b>${e(itemText(g))}</b><small>/p/${g.slug} · ${e(kind)} · ${who(ctx, g)}</small></span>` +
    `<span class="ad-rr-r">${reasons}</span><span class="ad-rr-n">${g.n}</span><span class="ad-rr-at">${when(ctx, v.tab === "open" ? g.first_at : g.last_at)}</span></a>`
  );
}

function actions(ctx: AdminContext, v: ReportsView): string {
  const s = v.selected!;
  const { t } = ctx.intl;
  if (v.tab !== "open" || !canModerate(ctx.role)) return "";
  const back = withQuery(BASE, { k: v.kind === "all" ? "" : v.kind });
  const isComment = !!s.group.comment_id;
  const form = (action: string, label: string, cls: string, extra = "") =>
    `<form class="ad-handle" method="post" action="/admin">${hiddenFields({ action, target: s.report.id, back })}${reasonField(ctx)}${extra}` +
    `<button type="submit" class="ni-btn ni-btn-sm ${cls}">${e(label)}</button></form>`;
  return (
    `<div class="ad-dsec"><h3>${e(t("admin.detail.handle"))}</h3>` +
    form("takedown", t(isComment ? "admin.hideComment" : "admin.removePost"), "ad-btn-danger", isComment ? banFields(ctx) : "") +
    form("dismiss", t("admin.dismiss"), "ni-btn-ghost") +
    `</div>`
  );
}

function detail(ctx: AdminContext, v: ReportsView): string {
  const { t } = ctx.intl;
  const s = v.selected;
  if (!s) return `<section class="ad-cd ad-detail">${emptyRow(t("admin.detail.select"))}</section>`;
  const g = s.group;
  const kv = (k: string, val: string) => `<div class="ad-kv2"><span>${e(t(k))}</span><span>${val}</span></div>`;
  const at = s.comment ? s.comment.created_at : null;
  const visitor = g.comment_id && !g.comment_author ? kv("admin.detail.visitor", e(t("admin.detail.visitorRecent", { count: s.visitorRecent }))) : "";
  const lines = s.lines
    .map((l) => `<div class="ad-kv2"><span>${e(t(`share.report.reason.${l.reason}`))}</span><span>${l.detail ? `“${e(l.detail)}” · ` : ""}${l.reporter_handle ? `@${e(l.reporter_handle)}` : e(t("admin.detail.visitorReporter"))} · ${when(ctx, l.created_at)}</span></div>`)
    .join("");
  return (
    `<section class="ad-cd ad-detail"><h2>${e(t(g.comment_id ? "admin.kind.comment" : "admin.kind.post"))} · ${e(t("admin.detail.reports", { count: g.n }))}` +
    `<a class="ad-lnk" href="/p/${g.slug}${g.comment_id ? `#c-${g.comment_id}` : ""}" target="_blank" rel="noopener">${e(t("admin.detail.openPost"))} ↗</a></h2>` +
    `<div class="ad-dsec"><h3>${e(t("admin.detail.reported"))}</h3><blockquote class="ad-quote">${e(itemText(g))}</blockquote>` +
    kv("admin.detail.author", who(ctx, g)) + (g.comment_id ? kv("admin.detail.post", `<a href="/p/${g.slug}" target="_blank" rel="noopener">${e(cardTitle(g))}</a>`) : "") +
    (at ? kv("admin.detail.at", when(ctx, at, false)) : "") + visitor + `</div>` +
    `<div class="ad-dsec"><h3>${e(t("admin.detail.reports", { count: s.lines.length }))}</h3>${lines}</div>${actions(ctx, v)}</section>`
  );
}

/** Report queue (variant A): reports on the same item merged into one row; details and actions on the right. */
export function renderReports(ctx: AdminContext, v: ReportsView): string {
  const { t } = ctx.intl;
  const k = v.kind === "all" ? "" : v.kind;
  const tabBar = tabs((["open", "resolved", "dismissed"] as ReportTab[]).map((tab) => ({ href: withQuery(BASE, { tab: tab === "open" ? "" : tab, k }), label: t(`admin.tab.${tab}`), on: tab === v.tab, count: tab === "open" ? v.counts.open : undefined })));
  const kinds = tabs((["all", "posts", "comments"] as ReportKind[]).map((kind) => ({ href: withQuery(BASE, { tab: v.tab === "open" ? "" : v.tab, k: kind === "all" ? "" : kind }), label: t(kind === "all" ? "admin.filter.both" : `admin.nav.${kind}`), on: kind === v.kind })), "ad-seg");
  const list = v.groups.length ? v.groups.map((g) => listRow(ctx, v, g)).join("") : emptyRow(t("admin.queueEmpty"));
  const main =
    `${notice(ctx, v.notice)}<div class="ad-split"><section class="ad-cd ad-list"><div class="ad-list-h">${tabBar}${kinds}</div>${list}</section>${detail(ctx, v)}</div>`;
  return renderAdmin(ctx, { section: "reports", title: t("admin.nav.reports"), main });
}
