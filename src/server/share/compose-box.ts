import { SHORT_MAX_CHARS } from "@/server/documents/derive";
import { escapeHtml } from "@/server/render/escape";
import { WEB_MAX_AUDIOS, WEB_MAX_IMAGES, WEB_MAX_TEXT } from "@/server/posts/web-compose";
import type { ChromeContext } from "./chrome";
import { composeToolbar } from "./compose-toolbar";
import { avatarHtml } from "./profile-bits";

export const COMPOSE_ERRORS = ["empty", "too_much", "short_too_long", "too_large", "unsupported", "rate_limited", "failed"] as const;
export type ComposeError = (typeof COMPOSE_ERRORS)[number];

export function composeError(url: URL): ComposeError | null {
  const v = url.searchParams.get("compose");
  return (COMPOSE_ERRORS as readonly string[]).includes(v ?? "") ? (v as ComposeError) : null;
}

const errorText = (ctx: ChromeContext, e: ComposeError) => ctx.intl.t(`compose.error.${e}`, { article: ctx.intl.t("compose.mode.long"), max: SHORT_MAX_CHARS });

/** Labels and limits for /scripts/compose.js (the script carries no text of its own). */
function scriptData(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const attr = (name: string, value: string | number) => ` data-${name}="${escapeHtml(String(value))}"`;
  return (
    COMPOSE_ERRORS.map((e) => attr(`err-${e.replace(/_/g, "-")}`, errorText(ctx, e))).join("") +
    attr("link-prompt", t("compose.linkPrompt")) + attr("posting", t("compose.posting")) + attr("remove-label", t("compose.remove")) +
    attr("short-max", SHORT_MAX_CHARS) + attr("max-images", WEB_MAX_IMAGES) + attr("max-audios", WEB_MAX_AUDIOS)
  );
}

/**
 * Compose card at the top of the signed-in home timeline (v4 compose-v2 design).
 * With JS: a rich editor (short post / article). Without JS: title (article only),
 * plain text, image and audio files, short / article toggle — still publishes.
 */
export function composeBox(ctx: ChromeContext, error: ComposeError | null): string {
  const v = ctx.viewer;
  if (!v || ctx.restricted) return "";
  const { t } = ctx.intl;
  const name = v.display_name || `@${v.handle}`;
  const placeholder = escapeHtml(t("compose.placeholder"));
  const title = escapeHtml(t("compose.title"));
  const err = `<p class="ni-compose-err" role="alert" data-compose-err${error ? "" : " hidden"}>${error ? escapeHtml(errorText(ctx, error)) : ""}</p>`;
  return (
    `<form class="ni-card ni-compose" method="post" action="/api/web/compose" enctype="multipart/form-data"${scriptData(ctx)}>` +
    `<div class="ni-compose-top">${avatarHtml(name, v.avatar_url, 40)}<div class="ni-compose-f">${err}` +
    `<input class="ni-compose-title" name="title" maxlength="200" placeholder="${title}" aria-label="${title}">` +
    `<textarea class="ni-compose-text" name="text" rows="5" maxlength="${WEB_MAX_TEXT}" placeholder="${placeholder}" aria-label="${placeholder}"></textarea>` +
    `<div class="ni-compose-ed" data-compose-editor></div><div class="ni-compose-tray" data-compose-tray hidden></div></div></div>` +
    `${composeToolbar(ctx)}</form>`
  );
}
