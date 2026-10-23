import type { AdminBanRow, AdminCommentRow, AdminPostRow, AuditRow, Page } from "@/server/db/repos/admin-lists";
import type { CommentStatus, PostStatus } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "@/server/share/card";
import { actionPop, emptyRow, notice, pager, pill, searchForm, table, tabs, when, withQuery } from "./parts";
import { renderAdmin, type AdminContext } from "./shell";

const e = escapeHtml;
type Note = "done" | "failed" | null;
const POST_STATUSES: (PostStatus | "")[] = ["", "active", "removed", "unpublished"];
const COMMENT_STATUSES: (CommentStatus | "")[] = ["", "visible", "hidden", "deleted"];

const body = (n: Note, ctx: AdminContext, filters: string, page: Page<unknown>, rows: string, base: string, offset: number) =>
  `${notice(ctx, n)}<div class="ad-filters">${filters}</div>${page.rows.length ? rows : `<section class="ad-cd">${emptyRow(ctx.intl.t("feed.empty"))}</section>`}${pager(ctx, base, offset, page.more)}`;

export function renderPosts(ctx: AdminContext, v: { status: PostStatus | null; query: string; offset: number; page: Page<AdminPostRow>; notice: Note }): string {
  const { t, format } = ctx.intl;
  const base = withQuery("/admin/posts", { s: v.status ?? "", q: v.query });
  const statusTabs = tabs(POST_STATUSES.map((s) => ({ href: withQuery("/admin/posts", { s, q: v.query }), label: t(s ? `admin.status.${s}` : "admin.filter.all"), on: (v.status ?? "") === s })), "ad-seg");
  const tone = (s: PostStatus) => (s === "active" ? "ok" : s === "removed" ? "bad" : "");
  const rows = v.page.rows.map((p) => {
    const back = withQuery(base, { o: v.offset });
    const act =
      p.status === "active" ? actionPop(ctx, { action: "remove-post", target: p.slug, back, label: t("admin.removePost"), danger: true })
      : p.status === "removed" ? actionPop(ctx, { action: "restore-post", target: p.slug, back, label: t("admin.restorePost") }) : "";
    return [
      `<a class="ad-tt" href="/p/${p.slug}" target="_blank" rel="noopener">${e(cardTitle(p))}</a><small>/p/${p.slug} · ${e(t(p.kind === "article" ? "feed.article" : "compose.mode.short"))}</small>`,
      `@${e(p.handle)}`, pill(t(`admin.status.${p.status}`), tone(p.status)), e(format.number(p.like_count)), e(format.number(p.comment_count)), when(ctx, p.published_at), act,
    ];
  });
  const head: [string, string?][] = [[e(t("admin.col.post"))], [e(t("admin.col.author"))], [e(t("admin.col.status"))], [e(t("admin.col.likes")), "n"], [e(t("admin.col.comments")), "n"], [e(t("admin.col.published"))], ["", "a"]];
  const filters = statusTabs + searchForm(ctx, "/admin/posts", v.query, "admin.posts.search", v.status ? { s: v.status } : {});
  return renderAdmin(ctx, { section: "posts", title: t("admin.nav.posts"), main: body(v.notice, ctx, filters, v.page, table(head, rows), base, v.offset) });
}

export function renderComments(ctx: AdminContext, v: { status: CommentStatus | null; query: string; offset: number; page: Page<AdminCommentRow>; notice: Note }): string {
  const { t } = ctx.intl;
  const base = withQuery("/admin/comments", { s: v.status ?? "", q: v.query });
  const statusTabs = tabs(COMMENT_STATUSES.map((s) => ({ href: withQuery("/admin/comments", { s, q: v.query }), label: t(s ? `admin.commentStatus.${s}` : "admin.filter.all"), on: (v.status ?? "") === s })), "ad-seg");
  const rows = v.page.rows.map((c) => {
    const back = withQuery(base, { o: v.offset });
    const act =
      c.status === "visible" ? actionPop(ctx, { action: "hide-comment", target: c.id, back, label: t("admin.hideComment"), danger: true, ban: !c.author_id })
      : c.status === "hidden" ? actionPop(ctx, { action: "restore-comment", target: c.id, back, label: t("admin.restoreComment") }) : "";
    const author = c.handle ? `@${e(c.handle)}` : e(c.anon_name || t("share.comments.anonymous"));
    return [
      `<span class="ad-tt ad-clamp">${e(c.body)}</span><small><a href="/p/${c.slug}#c-${c.id}" target="_blank" rel="noopener">${e(cardTitle(c))}</a></small>`,
      author, pill(t(`admin.commentStatus.${c.status}`), c.status === "visible" ? "ok" : c.status === "hidden" ? "warn" : ""), when(ctx, c.created_at), act,
    ];
  });
  const head: [string, string?][] = [[e(t("admin.col.comment"))], [e(t("admin.col.author"))], [e(t("admin.col.status"))], [e(t("admin.col.time"))], ["", "a"]];
  const filters = statusTabs + searchForm(ctx, "/admin/comments", v.query, "admin.comments.search", v.status ? { s: v.status } : {});
  return renderAdmin(ctx, { section: "comments", title: t("admin.nav.comments"), main: body(v.notice, ctx, filters, v.page, table(head, rows), base, v.offset) });
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
    a.slug ? `<a href="/p/${a.slug}${a.comment_id ? `#c-${a.comment_id}` : ""}" target="_blank" rel="noopener">/p/${a.slug}</a>${a.comment_id ? ` · ${e(t("admin.kind.comment"))}` : ""}` : "",
    e(a.reason),
  ]);
  const head: [string, string?][] = [[e(t("admin.col.time"))], [e(t("admin.col.actor"))], [e(t("admin.col.action"))], [e(t("admin.col.item"))], [e(t("admin.col.reason"))]];
  const main = v.page.rows.length ? table(head, rows) : `<section class="ad-cd">${emptyRow(t("feed.empty"))}</section>`;
  return renderAdmin(ctx, { section: "audit", title: t("admin.nav.audit"), main: main + pager(ctx, "/admin/audit", v.offset, v.page.more) });
}
