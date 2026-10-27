import type { Profile } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { commentBody } from "./comments-section";
import { moreLink } from "./feed-list";
import type { RepliesPage, ReplyItem } from "./load-profile-lists";
import { avatarHtml, profilePath } from "./profile-bits";
import { quoteEmbed } from "./quote-embed";

/** "Replying to @x" (the answered comment's author, or the post's author); a guest is named without a link. */
function replyingTo(ctx: ChromeContext, r: ReplyItem): string {
  const name = r.toHandle ? `@${r.toHandle}` : r.toName || ctx.intl.t("share.comments.anonymous");
  const who = r.toHandle ? `<a href="${profilePath(r.toHandle)}">${escapeHtml(name)}</a>` : `<b>${escapeHtml(name)}</b>`;
  const [before, after = ""] = ctx.intl.t("share.comments.replyingTo", { name: "\u0000" }).split("\u0000");
  return `<p class="ni-reply-to">${escapeHtml(before)}${who}${escapeHtml(after)}</p>`;
}

/** One comment of the profile owner (approved 2026-10-27 design): author row, "Replying to", text, the post it is on. Opens the comment. */
function replyCard(ctx: ChromeContext, author: Profile, r: ReplyItem): string {
  const name = author.display_name || `@${author.handle}`;
  const href = profilePath(author.handle);
  const link = `/p/${r.post.slug}#c-${r.id}`;
  const head =
    `<div class="ni-fc-head"><a href="${href}" tabindex="-1" aria-hidden="true">${avatarHtml(name, author.avatar_url, 42)}</a><div class="ni-who">` +
    `<a class="ni-name" href="${href}">${escapeHtml(name)}</a><span class="ni-meta"><span class="ni-handle">@${escapeHtml(author.handle)}</span><i class="ni-dot"></i>` +
    `<a href="${link}"><time datetime="${r.at.toISOString()}" data-rel>${escapeHtml(ctx.intl.format.dateTime(r.at, { dateStyle: "medium" }))}</time></a></span></div></div>`;
  return `<article class="ni-card ni-fc ni-reply" data-href="${link}">${head}${replyingTo(ctx, r)}<div class="ni-fc-text ni-reply-body">${commentBody(r.body)}</div>${quoteEmbed(ctx, r.post)}</article>`;
}

/** The "Replies" list with its "load more" link; a note when there are none. */
export function repliesList(ctx: ChromeContext, author: Profile, page: RepliesPage, base: string): string {
  if (page.items.length === 0) return `<p class="ni-card ni-feed-empty">${escapeHtml(ctx.intl.t("feed.empty"))}</p>`;
  return page.items.map((r) => replyCard(ctx, author, r)).join("") + moreLink(ctx, page.next, base, "replies");
}
