import { escapeHtml } from "@/server/render/escape";
import { WEB_MAX_IMAGES, WEB_MAX_TEXT } from "@/server/posts/web-compose";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";
import { avatarHtml } from "./profile-bits";

export const COMPOSE_ERRORS = ["empty", "too_much", "too_large", "unsupported", "rate_limited", "failed"] as const;
export type ComposeError = (typeof COMPOSE_ERRORS)[number];

export function composeError(url: URL): ComposeError | null {
  const v = url.searchParams.get("compose");
  return (COMPOSE_ERRORS as readonly string[]).includes(v ?? "") ? (v as ComposeError) : null;
}

/** Compose card at the top of the signed-in home timeline (approved v2 design). Works without JS. */
export function composeBox(ctx: ChromeContext, error: ComposeError | null): string {
  const v = ctx.viewer;
  if (!v || ctx.restricted) return "";
  const { t } = ctx.intl;
  const name = v.display_name || `@${v.handle}`;
  const err = error ? `<p class="ni-compose-err" role="alert">${escapeHtml(t(`compose.error.${error}`))}</p>` : "";
  return (
    `<form class="ni-card ni-compose" method="post" action="/api/web/compose" enctype="multipart/form-data">${avatarHtml(name, v.avatar_url, 40)}` +
    `<div class="ni-compose-f">${err}<input class="ni-compose-title" name="title" maxlength="200" placeholder="${escapeHtml(t("compose.titlePlaceholder"))}" aria-label="${escapeHtml(t("compose.titlePlaceholder"))}">` +
    `<textarea name="text" rows="3" maxlength="${WEB_MAX_TEXT}" placeholder="${escapeHtml(t("compose.placeholder"))}" aria-label="${escapeHtml(t("compose.placeholder"))}"></textarea>` +
    `<div class="ni-compose-row"><label class="ni-ib" title="${escapeHtml(t("compose.addImages", { max: WEB_MAX_IMAGES }))}">${icon("image")}` +
    `<input type="file" name="images" accept="image/*" multiple aria-label="${escapeHtml(t("compose.addImages", { max: WEB_MAX_IMAGES }))}"></label>` +
    `<span class="ni-compose-files" data-compose-files="${escapeHtml(t("compose.imagesChosen", { count: "{n}" }))}"></span><span class="ni-sp"></span>` +
    `<button type="submit" class="ni-btn ni-btn-primary">${escapeHtml(t("compose.publish"))}</button></div></div></form>`
  );
}
