import { canModerate } from "@/server/admin/roles";
import { escapeHtml } from "@/server/render/escape";
import { icon } from "@/server/share/icons";
import type { AdminContext } from "./shell";

/** Rows per admin list page. */
export const PAGE_SIZE = 30;
const PRESETS = ["spam", "terms", "rights", "duplicate", "noViolation"] as const;
const BAN_DAYS = [1, 7, 30] as const;

const e = escapeHtml;

export function when(ctx: AdminContext, at: Date, rel = true): string {
  return `<time datetime="${at.toISOString()}"${rel ? " data-rel" : ""}>${e(ctx.intl.format.dateTime(at, { dateStyle: "medium", timeStyle: "short" }))}</time>`;
}

export type Tab = { href: string; label: string; on: boolean; count?: number };

export function tabs(items: Tab[], cls = "ad-tabs"): string {
  return `<nav class="${cls}">${items.map((i) => `<a href="${e(i.href)}"${i.on ? ' aria-current="page"' : ""}>${e(i.label)}${i.count ? ` <span>${i.count}</span>` : ""}</a>`).join("")}</nav>`;
}

/** Adds / replaces query parameters of a same-site URL (empty value removes it). */
export function withQuery(base: string, params: Record<string, string | number>): string {
  const u = new URL(base, "http://x");
  for (const [k, v] of Object.entries(params)) {
    if (v === "" || v === 0) u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  return u.pathname + u.search;
}

/** Previous / next links (offset `o`). */
export function pager(ctx: AdminContext, base: string, offset: number, more: boolean): string {
  if (!offset && !more) return "";
  const { t } = ctx.intl;
  const prev = offset > 0 ? `<a class="ni-btn ni-btn-ghost ni-btn-sm" href="${e(withQuery(base, { o: Math.max(0, offset - PAGE_SIZE) }))}">${e(t("admin.pager.prev"))}</a>` : "";
  const next = more ? `<a class="ni-btn ni-btn-ghost ni-btn-sm" href="${e(withQuery(base, { o: offset + PAGE_SIZE }))}">${e(t("admin.pager.next"))}</a>` : "";
  return `<div class="ad-pager">${prev}${next}</div>`;
}

/** Suggested reasons for the reason fields (native <datalist>: works without JS, free text allowed). */
export function reasonList(ctx: AdminContext): string {
  return `<datalist id="ad-reasons">${PRESETS.map((p) => `<option value="${e(ctx.intl.t(`admin.preset.${p}`))}"></option>`).join("")}</datalist>`;
}

export function reasonField(ctx: AdminContext): string {
  const label = e(ctx.intl.t("admin.reason"));
  return `<input class="ad-in" name="reason" required maxlength="500" list="ad-reasons" placeholder="${label}" aria-label="${label}" autocomplete="off">`;
}

/** Optional ban of the commenter, sent with "hide comment". */
export function banFields(ctx: AdminContext): string {
  const { t } = ctx.intl;
  const days = BAN_DAYS.map((d) => `<option value="${d}"${d === 7 ? " selected" : ""}>${e(t("admin.ban.days", { count: d }))}</option>`).join("");
  return (
    `<label class="ad-chk"><input type="checkbox" name="ban" value="1">${e(t("admin.ban.with"))}</label>` +
    `<label class="ad-row"><span>${e(t("admin.ban.duration"))}</span><select class="ad-in" name="days">${days}<option value="">${e(t("admin.ban.forever"))}</option></select></label>` +
    `<label class="ad-chk"><input type="checkbox" name="ip" value="1">${e(t("admin.ban.byIp"))}</label>`
  );
}

export const hiddenFields = (fields: Record<string, string>) =>
  Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${e(v)}">`).join("");

/** Row action: a small button opening a form with the (required) reason. Nothing for read-only members. */
export function actionPop(ctx: AdminContext, o: { action: string; target: string; back: string; label: string; danger?: boolean; ban?: boolean }): string {
  if (!canModerate(ctx.role)) return "";
  const cls = o.danger ? "ad-btn-danger" : "ni-btn-ghost";
  return (
    `<details class="ni-menu ad-pop"><summary class="ad-act${o.danger ? " ad-danger" : ""}">${e(o.label)}</summary>` +
    `<form class="ad-pop-f" method="post" action="/admin">${hiddenFields({ action: o.action, target: o.target, back: o.back })}${reasonField(ctx)}` +
    `${o.ban ? banFields(ctx) : ""}<button type="submit" class="ni-btn ni-btn-sm ${cls}">${e(o.label)}</button></form></details>`
  );
}

export const pill = (text: string, tone: "ok" | "bad" | "warn" | "" = "") => `<span class="ad-pill${tone ? ` ${tone}` : ""}">${e(text)}</span>`;

/** Result of the last action (`?n=done|failed`). */
export function notice(ctx: AdminContext, n: "done" | "failed" | null): string {
  return n ? `<p class="ad-note ${n === "done" ? "ok" : "bad"}" role="status">${e(ctx.intl.t(`admin.${n}`))}</p>` : "";
}

export const emptyRow = (text: string) => `<p class="ad-empty">${e(text)}</p>`;

/** Table card; `head` cells are already escaped, `cls` per column ("n" = number); labels repeat per cell for the phone layout. */
export function table(head: [string, string?][], rows: string[][], title = ""): string {
  const th = head.map(([h, c]) => `<th${c ? ` class="${c}"` : ""}>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((cell, i) => `<td${head[i]?.[1] ? ` class="${head[i][1]}"` : ""}${head[i]?.[0] ? ` data-label="${head[i][0]}"` : ""}>${cell}</td>`).join("")}</tr>`).join("");
  return `<section class="ad-cd ad-tbl">${title ? `<h2>${title}</h2>` : ""}<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></section>`;
}

/** Search box of a list page (GET; keeps the other filters). */
export function searchForm(ctx: AdminContext, action: string, query: string, placeholderKey: string, keep: Record<string, string> = {}): string {
  const label = e(ctx.intl.t(placeholderKey));
  return (
    `<form class="ni-search ad-find" role="search" method="get" action="${action}">${icon("search")}` +
    `<input type="search" name="q" value="${e(query)}" placeholder="${label}" aria-label="${label}" maxlength="100" autocomplete="off">${hiddenFields(keep)}</form>`
  );
}
