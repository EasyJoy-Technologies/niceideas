import { canModerate } from "@/server/admin/roles";
import { BULK_ACTION, BULK_COMMENT_OPS, BULK_POST_OPS, type BulkOp, type BulkResult } from "@/server/admin/bulk-actions";
import { VISIBILITIES } from "@/server/posts/visibility";
import { escapeHtml } from "@/server/render/escape";
import { visibilityLabel } from "@/server/share/visibility-bits";
import { hiddenFields, notice, reasonField, table } from "./parts";
import type { AdminContext } from "./shell";

const e = escapeHtml;
/** Id of the bulk form; the row checkboxes join it with `form=` (works without JS, tables hold row forms). */
const FORM_ID = "ad-bulk";
/** Actions that take content away: their button is red (public/scripts/admin.js keeps it in step with the choice). */
const DANGER: readonly BulkOp[] = ["remove-post", "hide-comment"];

/** Label of a bulk action: the single-item action's own label, "Narrow visibility" for visibility. */
export function bulkOpLabel(ctx: AdminContext, op: BulkOp): string {
  const key = { "remove-post": "admin.removePost", "restore-post": "admin.restorePost", "set-visibility": "admin.bulk.narrow", "hide-comment": "admin.hideComment", "restore-comment": "admin.restoreComment" }[op];
  return ctx.intl.t(key);
}

/** Leading checkbox cell of a list row. */
function bulkCheck(ctx: AdminContext, value: string): string {
  return `<input type="checkbox" form="${FORM_ID}" name="targets" value="${e(value)}" aria-label="${e(ctx.intl.t("admin.bulk.pick"))}">`;
}

/**
 * Bulk bar above a list table (approved draft docs/design/mockups/admin/bulk/): select all on this page and the
 * count (JS), the action, the visibility target (posts), one required reason, apply. Nothing for read-only members.
 * The count texts go to the script as templates (`{count}` filled in on the page).
 */
function bulkBar(ctx: AdminContext, kind: "posts" | "comments", back: string, total: number): string {
  const { t } = ctx.intl;
  const ops: readonly BulkOp[] = kind === "posts" ? BULK_POST_OPS : BULK_COMMENT_OPS;
  const options = ops.map((op) => `<option value="${op}">${e(bulkOpLabel(ctx, op))}</option>`).join("");
  const visibility =
    kind === "posts"
      ? `<label class="ad-row" data-bulk-vis><span>${e(t("admin.bulk.to"))}</span><select class="ad-in" name="visibility">${VISIBILITIES.filter((v) => v !== "public").map((v) => `<option value="${v}">${e(visibilityLabel(ctx, v))}</option>`).join("")}</select></label>`
      : "";
  const data = {
    "data-none": t("admin.bulk.selectAll"),
    "data-selected": t("admin.bulk.selected", { count: "{count}", total }),
    "data-apply": t("admin.bulk.apply"),
    "data-apply-n": t("admin.bulk.applyN", { count: "{count}" }),
    "data-danger": DANGER.join(" "),
  };
  const attrs = Object.entries(data).map(([k, v]) => ` ${k}="${e(v)}"`).join("");
  return (
    `<form id="${FORM_ID}" class="ad-bulk" method="post" action="/admin"${attrs}>${hiddenFields({ action: BULK_ACTION, back })}` +
    `<label class="ad-bulk-all" hidden><input type="checkbox" data-bulk-all><span>${e(t("admin.bulk.selectAll"))}</span></label>` +
    `<select class="ad-in" name="op" aria-label="${e(t("admin.col.action"))}">${options}</select>${visibility}${reasonField(ctx)}` +
    `<button type="submit" class="ni-btn ni-btn-sm ${DANGER.includes(ops[0]) ? "ad-btn-danger" : "ni-btn-primary"}" data-bulk-apply>${e(t("admin.bulk.apply"))}</button>` +
    `<button type="button" class="ad-lnk ad-bulk-x" data-bulk-clear hidden>${e(t("admin.bulk.clear"))}</button></form>`
  );
}

/**
 * List table with bulk selection: a checkbox column (`values[i]` = the row's item) and the bulk bar. Read-only
 * members get the plain table.
 */
export function bulkTable(ctx: AdminContext, kind: "posts" | "comments", back: string, head: [string, string?][], rows: string[][], values: string[]): string {
  if (!canModerate(ctx.role)) return table(head, rows);
  return table([["", "ck"], ...head], rows.map((r, i) => [bulkCheck(ctx, values[i]), ...r]), "", "", bulkBar(ctx, kind, back, rows.length));
}

/** Result of the last action on a list page: `?n=done|failed`, or the counts of a bulk action. */
export type ListNotice = "done" | "failed" | BulkResult | null;

export function listNotice(ctx: AdminContext, n: ListNotice): string {
  if (n === null || typeof n === "string") return notice(ctx, n);
  const { t, format } = ctx.intl;
  const text = t("admin.bulk.result", { action: bulkOpLabel(ctx, n.op), done: format.number(n.done), skipped: format.number(n.skipped) }) +
    (n.failed ? ` · ${t("admin.bulk.resultFailed", { count: format.number(n.failed) })}` : "");
  return `<p class="ad-note ${n.failed || !n.done ? "bad" : "ok"}" role="status">${e(text)}</p>`;
}
