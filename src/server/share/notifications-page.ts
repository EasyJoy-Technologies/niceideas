import { GLOSSARY } from "@/i18n/glossary";
import type { NotificationRow } from "@/server/db/repos/notifications";
import { escapeHtml } from "@/server/render/escape";
import { cardTitle } from "./card";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { icon, type IconName } from "./icons";
import { avatarHtml, profilePath } from "./profile-bits";

const ICON: Record<NotificationRow["kind"], IconName> = { like: "heart", comment: "comment", reply: "comment", follow: "person" };

/** Sentence with the actor's name as markup (the label is translated text; only the name element is markup). */
function sentence(ctx: ChromeContext, n: NotificationRow): string {
  const { t } = ctx.intl;
  const name = n.actorHandle ? n.actorName || `@${n.actorHandle}` : n.anonName || t(n.kind === "like" ? "notifications.someone" : "share.comments.anonymous");
  const who = n.actorHandle ? `<a class="ni-name" href="${profilePath(n.actorHandle)}">${escapeHtml(name)}</a>` : `<b>${escapeHtml(name)}</b>`;
  const [before, after = ""] = t(`notifications.${n.kind}`, { name: "\u0000" }).split("\u0000");
  return `${escapeHtml(before)}${who}${escapeHtml(after)}`;
}

function row(ctx: ChromeContext, n: NotificationRow, unread: boolean): string {
  const at = `<time datetime="${n.at.toISOString()}" data-rel>${escapeHtml(ctx.intl.format.dateTime(n.at, { dateStyle: "medium" }))}</time>`;
  const avatar = n.actorHandle ? avatarHtml(n.actorName || `@${n.actorHandle}`, n.actorAvatar, 40) : `<span class="ni-avatar ni-av-40 ni-anon">${icon("person")}</span>`;
  const post = n.postSlug ? `<a class="ni-note-post" href="/p/${n.postSlug}${n.kind === "like" ? "" : "#comments"}">${escapeHtml(cardTitle({ title: n.postTitle ?? "", summary: n.postSummary ?? "" }))}</a>` : "";
  const excerpt = n.excerpt ? `<p>${escapeHtml(n.excerpt)}</p>` : "";
  return (
    `<li class="ni-note${unread ? " ni-unread" : ""}"><span class="ni-note-ico ni-note-${n.kind}">${icon(ICON[n.kind])}</span>${avatar}` +
    `<div class="ni-note-body"><div>${sentence(ctx, n)} <span class="ni-meta">· ${at}</span></div>${excerpt}${post}</div></li>`
  );
}

/** Notifications of the signed-in user, newest first; items newer than the last visit are highlighted. */
export function renderNotificationsPage(ctx: ChromeContext, items: NotificationRow[], seenAt: Date): string {
  const { t } = ctx.intl;
  const title = t("notifications.title");
  const list = items.length
    ? `<ul class="ni-card ni-notes">${items.map((n) => row(ctx, n, n.at > seenAt)).join("")}</ul>`
    : `<p class="ni-card ni-feed-empty">${escapeHtml(t("notifications.empty"))}</p>`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main: `<main class="ni-main ni-feed-main"><div class="ni-feed-h"><h1>${escapeHtml(title)}</h1></div>${list}</main>`,
    side: true,
  });
}
