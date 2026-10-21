import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";

/** Follow / unfollow form button (works without JS). Hidden for the viewer's own profile and in mainland China. */
export function followButton(ctx: ChromeContext, handle: string, following: boolean, cls = ""): string {
  if (ctx.restricted || ctx.viewer?.handle === handle) return "";
  const { t } = ctx.intl;
  const label = escapeHtml(t(following ? "follow.following" : "follow.follow"));
  return (
    `<form class="ni-follow${cls ? ` ${cls}` : ""}" method="post" action="/follow"><input type="hidden" name="handle" value="${escapeHtml(handle)}">` +
    `<input type="hidden" name="on" value="${following ? "0" : "1"}"><input type="hidden" name="next" value="${escapeHtml(ctx.path)}">` +
    `<button type="submit" class="ni-btn ${following ? "ni-btn-ghost" : "ni-btn-soft"}" aria-pressed="${following}">${label}</button></form>`
  );
}
