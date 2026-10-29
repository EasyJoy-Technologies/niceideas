import type { OverviewSeries, TodoCounts, TopPost, Health } from "@/server/db/repos/admin-stats";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "@/server/share/card";
import { icon, type IconName } from "@/server/share/icons";
import { APP_VERSION } from "@/server/version";
import { stackedBars, sparkline } from "./charts";
import { table, when } from "./parts";
import { renderAdmin, type AdminContext } from "./shell";
import { adminSourceLabel, adminSourceOfClass, adminSources, postSourceLabel, type AdminSource } from "./source-class";

export type OverviewView = {
  series: OverviewSeries;
  authors: { now: number; prev: number };
  /** New posts per day (`days` entries) by raw source class (repos/admin-stats.ts `postsBySource`). */
  bySource: { days: number; byClass: Map<string, number[]> };
  top: TopPost[];
  todo: TodoCounts;
  health: Health;
};

const e = escapeHtml;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const KPIS: [keyof OverviewSeries, string][] = [["posts", "k1"], ["authors", "k2"], ["users", "k3"], ["likes", "k4"], ["comments", "k5"], ["reports", "k6"]];

function kpi(ctx: AdminContext, key: keyof OverviewSeries, cls: string, v: OverviewView): string {
  const { t, format } = ctx.intl;
  const s = v.series[key];
  const [now, prev] = key === "authors" ? [v.authors.now, v.authors.prev] : [sum(s.slice(7)), sum(s.slice(0, 7))];
  const pct = prev ? Math.round(((now - prev) / prev) * 100) : null;
  // More reports is bad news: their arrow colours flip.
  const good = key === "reports" ? (pct ?? 0) <= 0 : (pct ?? 0) >= 0;
  const delta = pct === null ? "" : `<span class="${good ? "up" : "down"}">${pct >= 0 ? "▲" : "▼"} ${format.number(Math.abs(pct))}%</span> `;
  return (
    `<div class="ad-kpi"><div class="ad-kl">${e(t(`admin.kpi.${key}`))}</div><div class="ad-kv"><b>${e(format.number(now))}</b>${sparkline(s, cls)}</div>` +
    `<div class="ad-kd">${delta}<span>${e(t("admin.kpi.vsPrev"))}</span></div></div>`
  );
}

/** Colour class of each source's stack (admin.css); our apps take s1, s2, s5 in order, later ones share s6 with "other". */
const APP_COLORS = ["s1", "s2", "s5"];
const colorOf = (s: AdminSource, i: number) => (s === "web" ? "s3" : s === "api" ? "s4" : s === "other" ? "s6" : (APP_COLORS[i] ?? "s6"));

/** Daily new posts stacked by source: each of our apps, other apps (only when there are any), web, third-party apps. */
function sourceStacks(v: OverviewView): { s: AdminSource; cls: string; values: number[] }[] {
  const { days, byClass } = v.bySource;
  const order = adminSources();
  const sums = new Map<AdminSource, number[]>(order.map((s) => [s, new Array<number>(days).fill(0)]));
  for (const [raw, values] of byClass) {
    const into = sums.get(adminSourceOfClass(raw))!;
    values.forEach((n, i) => (into[i] += n));
  }
  return order.filter((s) => s !== "other" || sum(sums.get(s)!) > 0).map((s, i) => ({ s, cls: colorOf(s, i), values: sums.get(s)! }));
}

function sourceChart(ctx: AdminContext, v: OverviewView): string {
  const { t, format } = ctx.intl;
  const { days } = v.bySource;
  const stacks = sourceStacks(v);
  const labels = Array.from({ length: days }, (_, i) => format.dateTime(new Date(Date.now() - (days - 1 - i) * 86_400_000), { month: "numeric", day: "numeric", timeZone: "UTC" }));
  const legend = stacks.map((k) => `<span class="ad-li"><i class="${k.cls}"></i>${e(adminSourceLabel(ctx, k.s))}</span>`).join("");
  const title = t("admin.chart.postsBySource");
  return `<section class="ad-cd ad-span8"><h2>${e(title)}<span class="ad-legend">${legend}</span></h2>${stackedBars(stacks, labels, title)}</section>`;
}

function todo(ctx: AdminContext, v: OverviewView): string {
  const { t } = ctx.intl;
  const row = (ico: IconName, tone: string, title: string, sub: string, n: number, href: string, act: string) =>
    `<a class="ad-td" href="${href}"><span class="ad-tdi ${n ? tone : ""}">${icon(ico)}</span><span><b>${e(title)}</b><small>${sub}</small></span>` +
    `<span class="ad-tag ${n ? tone : ""}">${n}</span><span class="ad-lnk">${e(act)} →</span></a>`;
  const oldest = v.todo.oldestReport ? e(t("admin.todo.oldest", { time: "{time}" })).replace("{time}", when(ctx, v.todo.oldestReport)) : e(t("admin.todo.none"));
  return (
    `<section class="ad-cd ad-span4"><h2>${e(t("admin.todo.title"))}</h2>` +
    row("flag", "r", t("admin.todo.reports"), oldest, v.todo.openReports, "/admin/reports", t("admin.todo.handle")) +
    row("comment", "y", t("admin.todo.hidden"), e(t("admin.todo.hiddenSub")), v.todo.hiddenComments, "/admin/comments?s=hidden", t("admin.todo.view")) +
    row("restricted", "y", t("admin.todo.bans"), e(t("admin.todo.bansSub")), v.todo.bansEnding, "/admin/bans", t("admin.todo.view")) +
    `</section>`
  );
}

function health(ctx: AdminContext, v: OverviewView): string {
  const { t, format } = ctx.intl;
  const bytes = (n: number) => format.number(n / 1024 ** 3, { maximumFractionDigits: 2 }) + " GB";
  const row = (k: string, val: string) => `<div class="ad-hl"><span class="ad-dot"></span><span>${e(t(k))}</span><span>${e(val)}</span></div>`;
  return (
    `<section class="ad-cd ad-span4"><h2>${e(t("admin.health.title"))}</h2>` +
    row("admin.health.site", `v${APP_VERSION}`) + row("admin.health.db", `${v.health.dbMs} ms · ${bytes(v.health.dbBytes)}`) +
    row("admin.health.media", bytes(v.health.mediaBytes)) + row("admin.health.posts", format.number(v.health.posts)) + `</section>`
  );
}

function topTable(ctx: AdminContext, v: OverviewView): string {
  const { t, format } = ctx.intl;
  const kind = (k: string) => t(k === "article" ? "feed.article" : "compose.mode.short");
  const rows = v.top.map((p) => [
    `<a class="ad-tt" href="/p/${p.slug}" target="_blank" rel="noopener">${e(cardTitle(p))}</a><small>${e(kind(p.kind))} · @${e(p.handle)}</small>`,
    e(postSourceLabel(ctx, p)),
    e(format.number(p.recent)), e(format.number(p.likes)), e(format.number(p.comments)),
  ]);
  const head: [string, string?][] = [[e(t("admin.col.post"))], [e(t("admin.col.source"))], [e(t("admin.col.likes7")), "n"], [e(t("admin.col.likes")), "n"], [e(t("admin.col.comments")), "n"]];
  return `<div class="ad-span8">${table(head, rows, e(t("admin.top.title")))}</div>`;
}

/** Overview (variant A): six trend cards, posts by source, to-do, system, most-liked posts. */
export function renderOverview(ctx: AdminContext, v: OverviewView): string {
  const main =
    `<div class="ad-grid"><div class="ad-k6">${KPIS.map(([k, c]) => kpi(ctx, k, c, v)).join("")}</div>` +
    `${sourceChart(ctx, v)}${todo(ctx, v)}${topTable(ctx, v)}${health(ctx, v)}</div>`;
  return renderAdmin(ctx, { section: "overview", title: ctx.intl.t("admin.nav.overview"), main });
}
