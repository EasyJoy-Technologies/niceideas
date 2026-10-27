import { escapeHtml } from "@/server/render/escape";
import type { FeedRow } from "@/server/db/repos/feed";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { profilePath } from "./profile-bits";

/** "X reposted" / "You reposted" above a card shown because an account reposted it; empty otherwise. */
export function repostedLine(ctx: ChromeContext, post: Pick<FeedRow, "reposter_handle" | "reposter_name">): string {
  const handle = post.reposter_handle;
  if (!handle) return "";
  const { t } = ctx.intl;
  if (ctx.viewer?.handle === handle) return `<div class="ni-fc-rp">${icon("repost")}<span>${escapeHtml(t("share.post.repostedByYou"))}</span></div>`;
  // The label is translated text; only the name element is markup.
  const [before, after = ""] = t("share.post.repostedBy", { name: "\u0000" }).split("\u0000");
  const who = `<a href="${profilePath(handle)}">${escapeHtml(post.reposter_name || `@${handle}`)}</a>`;
  return `<div class="ni-fc-rp">${icon("repost")}<span>${escapeHtml(before)}${who}${escapeHtml(after)}</span></div>`;
}
