import type { AdminBanRow, AdminCommentRow, AdminPostRow, AuditRow, Page } from "@/server/db/repos/admin-lists";
import type { CommentStatus, PostStatus, PostVisibility } from "@/server/db/schema";
import { isNarrower, isVisibility, VISIBILITIES } from "@/server/posts/visibility";
import { icon } from "@/server/share/icons";
import { VISIBILITY_ICONS, visibilityLabel } from "@/server/share/visibility-bits";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "@/server/share/card";
import { bulkTable, listNotice, type ListNotice } from "./bulk-bar";
import { actionPop, emptyRow, notice, pager, pill, searchForm, table, tabs, when, withQuery } from "./parts";
import { renderAdmin, type AdminContext } from "./shell";
import { adminSourceLabel, adminSources, postSourceLabel, type AdminSource } from "./source-class";
import { appSettingsItem } from "./apps-page";

const e = escapeHtml;
type Note = "done" | "failed" | null;
const POST_STATUSES: (PostStatus | "")[] = ["", "active", "removed", "unpublished"];
const COMMENT_STATUSES: (CommentStatus | "")[] = ["", "visible", "hidden", "deleted"];

const body = (n: ListNotice, ctx: AdminContext, filters: string, page: Page<unknown>, rows: string, base: string, offset: number) =>
  `${listNotice(ctx, n)}<div class="ad-filters">${filters}</div>${page.rows.length ? rows : `<section class="ad-cd">${emptyRow(ctx.intl.t("feed.empty"))}</section>`}${pager(ctx, base, offset, page.more)}`;

/** Who may see the post: icon and label as on the site (share/visibility-bits.ts). */
const visibilityText = (ctx: AdminContext, v: PostVisibility) => `<span class="ad-vis">${icon(VISIBILITY_ICONS[v])}${e(visibilityLabel(ctx, v))}</span>`;

/**
 * The Visibility cell (plan docs/plan/2026-11-23-link-visibility.md §8). For a live post, the value opens the
 * change form: the current value (selected) and the narrower ones, and the reason. Otherwise, and for read-only
 * members, just the value.
 */
function visibilityCell(ctx: AdminContext, p: Pick<AdminPostRow, "slug" | "status" | "visibility">, back: string): string {
  const text = visibilityText(ctx, p.visibility);
  // Admins only narrow (moderation/admin.ts): the current value and the narrower ones; nothing narrower → just the value.
  const choices = VISIBILITIES.filter((v) => isNarrower(p.visibility, v));
  if (p.status !== "active" || choices.length === 0) return text;
  const label = e(ctx.intl.t("share.visibility.label"));
  const options = [p.visibility, ...choices].map((v) => `<option value="${v}"${v === p.visibility ? " selected" : ""}>${e(visibilityLabel(ctx, v))}</option>`).join("");
  const fields = `<label class="ad-row"><span>${label}</span><select class="ad-in" name="visibility">${options}</select></label>`;
  return actionPop(ctx, { action: "set-visibility", target: p.slug, back, label: ctx.intl.t("admin.setVisibility"), fields, summary: text }) || text;
}

/**
 * The Post cell (approved option A, 2026-11-23: fewer columns so the list fits at 1280 px in every language): the
 * title; author · source · published; likes · comments · link · kind.
 */
function postCell(ctx: AdminContext, p: AdminPostRow): string {
  const { t, format } = ctx.intl;
  const count = (ico: "heart" | "comment", label: string, n: number) =>
    `<span class="ad-cnt" title="${e(label)}">${icon(ico)}<span class="ad-sr">${e(label)} </span>${e(format.number(n))}</span>`;
  const kind = t(p.kind === "article" ? "feed.article" : "compose.mode.short");
  return (
    `<a class="ad-tt" href="/p/${p.slug}" target="_blank" rel="noopener">${e(cardTitle(p))}</a>` +
    `<small class="ad-meta">@${e(p.handle)} · ${e(postSourceLabel(ctx, p))} · ${when(ctx, p.published_at)}</small>` +
    `<small class="ad-meta">${count("heart", t("admin.col.likes"), p.like_count)} · ${count("comment", t("admin.col.comments"), p.comment_count)} · /p/${p.slug} · ${e(kind)}</small>`
  );
}

/** Audit detail of an admin visibility change (`from>to`, moderation/admin.ts). */
function visibilityChange(ctx: AdminContext, detail: string): string {
  const [from, to] = detail.split(">");
  return isVisibility(from) && isVisibility(to) ? ` · ${e(visibilityLabel(ctx, from))} → ${e(visibilityLabel(ctx, to))}` : "";
}

export function renderPosts(ctx: AdminContext, v: { status: PostStatus | null; source: AdminSource | null; query: string; offset: number; page: Page<AdminPostRow>; notice: ListNotice }): string {
  const { t } = ctx.intl;
  const src = v.source ?? "";
  const base = withQuery("/admin/posts", { s: v.status ?? "", src, q: v.query });
  const statusTabs = tabs(POST_STATUSES.map((s) => ({ href: withQuery("/admin/posts", { s, src, q: v.query }), label: t(s ? `admin.status.${s}` : "admin.filter.all"), on: (v.status ?? "") === s })), "ad-seg");
  const sourceTabs = tabs(
    (["", ...adminSources()] as const).map((k) => ({ href: withQuery("/admin/posts", { s: v.status ?? "", src: k, q: v.query }), label: k ? adminSourceLabel(ctx, k) : t("admin.filter.allSources"), on: src === k })),
    "ad-seg ad-seg-wrap",
  );
  const tone = (s: PostStatus) => (s === "active" ? "ok" : s === "removed" ? "bad" : "");
  const back = withQuery(base, { o: v.offset });
  const rows = v.page.rows.map((p) => {
    const act =
      p.status === "active" ? actionPop(ctx, { action: "remove-post", target: p.slug, back, label: t("admin.removePost"), danger: true })
      : p.status === "removed" ? actionPop(ctx, { action: "restore-post", target: p.slug, back, label: t("admin.restorePost") }) : "";
    return [postCell(ctx, p), pill(t(`admin.status.${p.status}`), tone(p.status)), visibilityCell(ctx, p, back), act];
  });
  const head: [string, string?][] = [[e(t("admin.col.post"))], [e(t("admin.col.status")), "nw"], [e(t("admin.col.visibility")), "nw"], ["", "a"]];
  const keep = { ...(v.status ? { s: v.status } : {}), ...(src ? { src } : {}) };
  const filters = statusTabs + sourceTabs + searchForm(ctx, "/admin/posts", v.query, "admin.posts.search", keep);
  return renderAdmin(ctx, { section: "posts", title: t("admin.nav.posts"), main: body(v.notice, ctx, filters, v.page, bulkTable(ctx, "posts", back, head, rows, v.page.rows.map((p) => p.slug)), base, v.offset) });
}

export function renderComments(ctx: AdminContext, v: { status: CommentStatus | null; query: string; offset: number; page: Page<AdminCommentRow>; notice: ListNotice }): string {
  const { t } = ctx.intl;
  const base = withQuery("/admin/comments", { s: v.status ?? "", q: v.query });
  const statusTabs = tabs(COMMENT_STATUSES.map((s) => ({ href: withQuery("/admin/comments", { s, q: v.query }), label: t(s ? `admin.commentStatus.${s}` : "admin.filter.all"), on: (v.status ?? "") === s })), "ad-seg");
  const back = withQuery(base, { o: v.offset });
  const rows = v.page.rows.map((c) => {
    const act =
      c.status === "visible" ? actionPop(ctx, { action: "hide-comment", target: c.id, back, label: t("admin.hideComment"), danger: true, ban: !c.author_id })
      : c.status === "hidden" ? actionPop(ctx, { action: "restore-comment", target: c.id, back, label: t("admin.restoreComment") }) : "";
    const author = c.handle ? `@${e(c.handle)}` : e(c.anon_name || t("share.comments.anonymous"));
    return [
      `<span class="ad-tt ad-clamp">${e(c.body)}</span><small><a href="/p/${c.slug}#c-${c.id}" target="_blank" rel="noopener">${e(cardTitle(c))}</a></small>`,
      author, pill(t(`admin.commentStatus.${c.status}`), c.status === "visible" ? "ok" : c.status === "hidden" ? "warn" : ""), when(ctx, c.created_at), act,
    ];
  });
  const head: [string, string?][] = [[e(t("admin.col.comment"))], [e(t("admin.col.author")), "nw"], [e(t("admin.col.status")), "nw"], [e(t("admin.col.time")), "nw"], ["", "a"]];
  const filters = statusTabs + searchForm(ctx, "/admin/comments", v.query, "admin.comments.search", v.status ? { s: v.status } : {});
  return renderAdmin(ctx, { section: "comments", title: t("admin.nav.comments"), main: body(v.notice, ctx, filters, v.page, bulkTable(ctx, "comments", back, head, rows, v.page.rows.map((c) => c.id)), base, v.offset) });
}

export function renderBans(ctx: AdminContext, v: { offset: number; page: Page<AdminBanRow>; notice: Note }): string {
  const { t } = ctx.intl;
  const rows = v.page.rows.map((b) => [
    pill(t(`admin.ban.${b.kind}`)), `<code class="ad-code">${e(b.key_hash.slice(0, 10))}…</code>`, e(b.reason),
    b.by_handle ? `@${e(b.by_handle)}` : e(b.created_by), when(ctx, b.created_at), b.expires_at ? when(ctx, b.expires_at, false) : e(t("admin.ban.forever")),
    actionPop(ctx, { action: "unban", target: `${b.kind}:${b.key_hash}`, back: withQuery("/admin/bans", { o: v.offset }), label: t("admin.ban.unban") }),
  ]);
  const head: [string, string?][] = [[e(t("admin.col.type"))], [""], [e(t("admin.col.reason"))], [e(t("admin.col.actor"))], [e(t("admin.col.time"))], [e(t("admin.col.ends"))], ["", "a"]];
  const main = v.page.rows.length ? table(head, rows) : `<section class="ad-cd">${emptyRow(t("admin.ban.empty"))}</section>`;
  return renderAdmin(ctx, { section: "bans", title: t("admin.nav.bans"), main: notice(ctx, v.notice) + main + pager(ctx, "/admin/bans", v.offset, v.page.more) });
}

export function renderAudit(ctx: AdminContext, v: { offset: number; page: Page<AuditRow> }): string {
  const { t } = ctx.intl;
  const rows = v.page.rows.map((a) => [
    when(ctx, a.created_at), a.actor_handle ? `@${e(a.actor_handle)}` : e(a.actor_id), e(t(`admin.action.${a.action}`)),
    a.action === "app_settings" ? appSettingsItem(ctx, a.detail)
    : a.slug ? `<a href="/p/${a.slug}${a.comment_id ? `#c-${a.comment_id}` : ""}" target="_blank" rel="noopener">/p/${a.slug}</a>${a.comment_id ? ` · ${e(t("admin.kind.comment"))}` : ""}${a.action === "visibility" ? visibilityChange(ctx, a.detail) : ""}` : "",
    e(a.reason),
  ]);
  const head: [string, string?][] = [[e(t("admin.col.time"))], [e(t("admin.col.actor"))], [e(t("admin.col.action"))], [e(t("admin.col.item"))], [e(t("admin.col.reason"))]];
  const main = v.page.rows.length ? table(head, rows) : `<section class="ad-cd">${emptyRow(t("feed.empty"))}</section>`;
  return renderAdmin(ctx, { section: "audit", title: t("admin.nav.audit"), main: main + pager(ctx, "/admin/audit", v.offset, v.page.more) });
}
