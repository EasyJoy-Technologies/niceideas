import { GLOSSARY } from "@/i18n/glossary";
import type { ReviewItem } from "@/server/db/repos/admin-queue";
import type { Post } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "./card";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";

export type AdminView = { queue: ReviewItem[]; lookup: Post | null; query: string; notice: "done" | "failed" | null };

function actionForm(ctx: ChromeContext, action: string, target: string, label: string, danger = false): string {
  const { t } = ctx.intl;
  return (
    `<form class="ni-admin-act" method="post" action="/admin"><input type="hidden" name="action" value="${action}"><input type="hidden" name="target" value="${escapeHtml(target)}">` +
    `<input name="reason" required maxlength="500" placeholder="${escapeHtml(t("admin.reason"))}" aria-label="${escapeHtml(t("admin.reason"))}">` +
    `<button type="submit" class="ni-btn ${danger ? "ni-btn-danger" : "ni-btn-ghost"}">${escapeHtml(label)}</button></form>`
  );
}

function reportRow(ctx: ChromeContext, r: ReviewItem): string {
  const { t, format } = ctx.intl;
  const target = r.comment_id
    ? `<blockquote>${escapeHtml(r.comment_body ?? "")}</blockquote>`
    : `<a href="/p/${r.slug}" target="_blank" rel="noopener">${escapeHtml(cardTitle({ title: r.title, summary: r.summary }))}</a>`;
  const kind = escapeHtml(t(r.comment_id ? "admin.kind.comment" : "admin.kind.post"));
  return (
    `<li class="ni-admin-item"><div class="ni-meta"><b>${escapeHtml(t(`share.report.reason.${r.reason}`))}</b> · ${kind} · ` +
    `<time datetime="${r.created_at.toISOString()}" data-rel>${escapeHtml(format.dateTime(r.created_at, { dateStyle: "medium" }))}</time> · <a href="/p/${r.slug}" target="_blank" rel="noopener">/p/${r.slug}</a></div>` +
    `${target}${r.detail ? `<p class="ni-admin-detail">${escapeHtml(r.detail)}</p>` : ""}` +
    `<div class="ni-admin-acts">${actionForm(ctx, "takedown", r.id, t(r.comment_id ? "admin.hideComment" : "admin.removePost"), true)}${actionForm(ctx, "dismiss", r.id, t("admin.dismiss"))}</div></li>`
  );
}

function lookupCard(ctx: ChromeContext, v: AdminView): string {
  const { t } = ctx.intl;
  const form =
    `<form class="ni-search" method="get" action="/admin"><input type="search" name="post" value="${escapeHtml(v.query)}" placeholder="${escapeHtml(t("admin.lookupPlaceholder"))}" aria-label="${escapeHtml(t("admin.lookupPlaceholder"))}"></form>`;
  let result = "";
  if (v.query && !v.lookup) result = `<p class="ni-meta">${escapeHtml(t("admin.notFound"))}</p>`;
  if (v.lookup) {
    const p = v.lookup;
    const act = p.status === "active" ? actionForm(ctx, "remove-post", p.slug, t("admin.removePost"), true) : p.status === "removed" ? actionForm(ctx, "restore-post", p.slug, t("admin.restorePost")) : "";
    result =
      `<div class="ni-admin-item"><div class="ni-meta"><b>${escapeHtml(t(`admin.status.${p.status}`))}</b> · <a href="/p/${p.slug}" target="_blank" rel="noopener">/p/${p.slug}</a></div>` +
      `<p>${escapeHtml(cardTitle(p))}</p>${act ? `<div class="ni-admin-acts">${act}</div>` : ""}</div>`;
  }
  return `<section class="ni-card ni-admin"><h2>${escapeHtml(t("admin.lookup"))}</h2>${form}${result}</section>`;
}

/** Moderation console (ADMIN_USER_IDS only): open reports queue + post lookup. Every action needs a reason and is audited. */
export function renderAdminPage(ctx: ChromeContext, v: AdminView): string {
  const { t } = ctx.intl;
  const title = t("admin.title");
  const notice = v.notice ? `<p class="${v.notice === "done" ? "ni-ok" : "ni-compose-err"}" role="status">${escapeHtml(t(`admin.${v.notice}`))}</p>` : "";
  const queue = v.queue.length
    ? `<ul class="ni-admin-list">${v.queue.map((r) => reportRow(ctx, r)).join("")}</ul>`
    : `<p class="ni-meta">${escapeHtml(t("admin.queueEmpty"))}</p>`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main:
      `<main class="ni-main ni-feed-main"><div class="ni-feed-h"><h1>${escapeHtml(title)}</h1></div>${notice}` +
      `<section class="ni-card ni-admin"><h2>${escapeHtml(t("admin.queue"))} <span class="ni-meta">${v.queue.length}</span></h2>${queue}</section>${lookupCard(ctx, v)}</main>`,
    side: true,
  });
}
