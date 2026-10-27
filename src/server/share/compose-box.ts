import { SHORT_MAX_CHARS } from "@/server/documents/derive";
import { escapeHtml } from "@/server/render/escape";
import { WEB_MAX_AUDIOS, WEB_MAX_IMAGES, WEB_MAX_TEXT } from "@/server/posts/web-compose";
import type { EditPrefill } from "@/server/posts/edit-source";
import type { ChromeContext } from "./chrome";
import { composeToolbar } from "./compose-toolbar";
import { icon } from "./icons";
import { avatarHtml } from "./profile-bits";

export const COMPOSE_ERRORS = ["empty", "too_much", "short_too_long", "too_large", "unsupported", "rate_limited", "failed", "quote_gone"] as const;
export type ComposeError = (typeof COMPOSE_ERRORS)[number];

export function composeError(url: URL): ComposeError | null {
  const v = url.searchParams.get("compose");
  return (COMPOSE_ERRORS as readonly string[]).includes(v ?? "") ? (v as ComposeError) : null;
}

/** Fixed type (editing, quoting): no type switch, so the short-post limit message does not suggest switching. */
const errorText = (ctx: ChromeContext, e: ComposeError, fixedType = false) =>
  fixedType && e === "short_too_long" ? ctx.intl.t("compose.error.shortTooLongEdit", { max: SHORT_MAX_CHARS }) : ctx.intl.t(`compose.error.${e}`, { article: ctx.intl.t("compose.mode.long"), max: SHORT_MAX_CHARS });

const attr = (name: string, value: string | number) => ` data-${name}="${escapeHtml(String(value))}"`;

/** Labels and limits for /scripts/compose.js (the script carries no text of its own). */
function scriptData(ctx: ChromeContext, fixedType: boolean, editing: boolean): string {
  const { t } = ctx.intl;
  return (
    COMPOSE_ERRORS.map((e) => attr(`err-${e.replace(/_/g, "-")}`, errorText(ctx, e, fixedType))).join("") +
    attr("link-prompt", t("compose.linkPrompt")) + attr("posting", t(editing ? "compose.saving" : "compose.posting")) + attr("remove-label", t("compose.remove")) +
    attr("short-max", SHORT_MAX_CHARS) + attr("max-images", WEB_MAX_IMAGES) + attr("max-audios", WEB_MAX_AUDIOS)
  );
}

/**
 * Compose card at the top of the signed-in home timeline (v4 compose-v2 design); on phones
 * a bottom sheet opened by the tab bar "+" (`/#compose`, CSS :target — no JS needed).
 * With JS: a rich editor (short post / article). Without JS: title (article only),
 * plain text, image and audio files, short / article toggle — still publishes.
 */
/** Editing a post: its slug and current content (`prefill`). */
export type ComposeEdit = { slug: string; prefill: EditPrefill };

/**
 * Editing: the same box opened with the post's content (editor JSON in data-prefill; the no-JS
 * textarea gets its Markdown and the stored media stay as `keep_*` fields), sent to the edit route.
 */
function editFields(edit: ComposeEdit): string {
  const p = edit.prefill;
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}" data-send>`;
  const keep = p.keep.map((m) => `<input type="hidden" name="keep_${m.kind}" value="${escapeHtml(m.mediaId)}">`).join("");
  return hidden("slug", edit.slug) + '<input type="hidden" name="format" value="markdown">' + keep;
}

/** Quoting a post: its slug and the embedded card shown under the editor (quote-embed.ts). */
export type ComposeQuote = { slug: string; embed: string };

export function composeBox(ctx: ChromeContext, error: ComposeError | null, edit?: ComposeEdit, quote?: ComposeQuote): string {
  const v = ctx.viewer;
  if (!v || ctx.restricted) return "";
  const { t } = ctx.intl;
  const name = v.display_name || `@${v.handle}`;
  const placeholder = escapeHtml(t(quote ? "compose.quotePlaceholder" : "compose.placeholder"));
  const title = escapeHtml(t("compose.title"));
  const p = edit?.prefill;
  // Edits and quotes have a fixed type: the short-post limit message does not suggest switching.
  const fixedType = !!edit || !!quote;
  const err = `<p class="ni-compose-err" role="alert" data-compose-err${error ? "" : " hidden"}>${error ? escapeHtml(errorText(ctx, error, fixedType)) : ""}</p>`;
  const action = edit ? "/api/web/posts/edit" : "/api/web/compose";
  const prefill = p ? attr("prefill", JSON.stringify({ doc: p.doc, tray: p.tray })) : "";
  const sheet = edit ? "" : `<div class="ni-sheet-h"><a class="ni-sheet-x" href="#" aria-label="${escapeHtml(t("share.action.close"))}">${icon("close")}</a></div>`;
  return (
    `<form class="ni-card ni-compose${quote ? " ni-compose-quote" : ""}" id="compose" method="post" action="${action}" enctype="multipart/form-data"${scriptData(ctx, fixedType, !!edit)}${prefill}>` +
    sheet + (edit ? editFields(edit) : "") + (quote ? `<input type="hidden" name="quote" value="${escapeHtml(quote.slug)}" data-send>` : "") +
    `<div class="ni-compose-top">${avatarHtml(name, v.avatar_url, 40)}<div class="ni-compose-f">${err}` +
    `<input class="ni-compose-title" name="title" maxlength="200" placeholder="${title}" aria-label="${title}" value="${escapeHtml(p?.title ?? "")}">` +
    `<textarea class="ni-compose-text" name="text" rows="5" maxlength="${WEB_MAX_TEXT}" placeholder="${placeholder}" aria-label="${placeholder}">${escapeHtml(p?.text ?? "")}</textarea>` +
    `<div class="ni-compose-ed" data-compose-editor></div><div class="ni-compose-tray" data-compose-tray hidden></div></div></div>` +
    (quote ? `<div class="ni-compose-quoted">${quote.embed}</div>` : "") +
    `${composeToolbar(ctx, p ? { mode: p.mode, save: true } : quote ? { mode: "short", save: false } : undefined)}</form>`
  );
}
