import { escapeHtml } from "@/server/render/escape";
import { WEB_MAX_AUDIOS, WEB_MAX_IMAGES } from "@/server/posts/web-compose";
import type { ChromeContext } from "./chrome";
import { icon, type IconName } from "./icons";

/**
 * Compose toolbar (v4 compose-v2 design): one row from the card's left edge —
 * image / audio | formatting | "…" | short / article toggle | Post.
 * Formatting needs the editor (`ni-ed-only`, shown once /scripts/compose.js is ready);
 * `data-only="long"`: article mode only; `ni-phone-hide` / `ni-phone-only`: moved into "…" on phones.
 */
type Fmt = { cmd: string; icon: IconName; long?: boolean; phone?: "hide" | "only" };

const ROW: (Fmt | "sep")[] = [
  { cmd: "heading", icon: "heading", long: true },
  { cmd: "bold", icon: "bold" },
  { cmd: "italic", icon: "italic", phone: "hide" },
  { cmd: "link", icon: "link", phone: "hide" },
  "sep",
  { cmd: "bulletList", icon: "bulletList" },
  { cmd: "taskList", icon: "taskList", phone: "hide" },
];

const MORE: Fmt[] = [
  { cmd: "italic", icon: "italic", phone: "only" },
  { cmd: "link", icon: "link", phone: "only" },
  { cmd: "taskList", icon: "taskList", phone: "only" },
  { cmd: "heading3", icon: "heading3", long: true },
  { cmd: "orderedList", icon: "orderedList", long: true },
  { cmd: "quote", icon: "quote", long: true },
  { cmd: "strike", icon: "strike", long: true },
  { cmd: "code", icon: "code", long: true },
  { cmd: "codeBlock", icon: "codeBlock", long: true },
  { cmd: "divider", icon: "divider", long: true },
];

const only = (f: Fmt) => (f.long ? ' data-only="long"' : "");
const phone = (f: Fmt) => (f.phone === "hide" ? " ni-phone-hide" : f.phone === "only" ? " ni-phone-only" : "");

function rowButton(ctx: ChromeContext, f: Fmt): string {
  const label = escapeHtml(ctx.intl.t(`compose.fmt.${f.cmd}`));
  return `<button type="button" class="ni-tb ni-ed-only${phone(f)}" data-cmd="${f.cmd}"${only(f)} aria-label="${label}" title="${label}" aria-pressed="false">${icon(f.icon)}</button>`;
}

function moreMenu(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const items = MORE.map((f) => `<li class="${phone(f).trim()}"${only(f)}><button type="button" data-cmd="${f.cmd}">${icon(f.icon)}${escapeHtml(t(`compose.fmt.${f.cmd}`))}</button></li>`).join("");
  const label = escapeHtml(t("compose.fmt.more"));
  // Wide screens, short post: every item is article-only or phone-only, so the menu is hidden (data-only).
  return `<details class="ni-menu ni-tb-more ni-ed-only" data-only="long"><summary class="ni-tb" aria-label="${label}" title="${label}">${icon("more")}</summary><ul>${items}</ul></details>`;
}

function mediaButton(ctx: ChromeContext, kind: "images" | "audios"): string {
  const label = escapeHtml(ctx.intl.t(kind === "images" ? "compose.addImages" : "compose.addAudio", { max: kind === "images" ? WEB_MAX_IMAGES : WEB_MAX_AUDIOS }));
  const accept = kind === "images" ? "image/*" : "audio/*,.m4a,.mp3,.aac,.ogg,.opus";
  return `<label class="ni-tb ni-tb-media" title="${label}">${icon(kind === "images" ? "image" : "music")}<input type="file" name="${kind}" accept="${accept}" multiple aria-label="${label}"></label>`;
}

function modeToggle(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const opt = (value: "short" | "long", checked: boolean) =>
    `<label><input type="radio" name="mode" value="${value}"${checked ? " checked" : ""}><span>${escapeHtml(t(`compose.mode.${value}`))}</span></label>`;
  return `<div class="ni-compose-seg" role="radiogroup" aria-label="${escapeHtml(t("compose.mode.label"))}">${opt("short", true)}${opt("long", false)}</div>`;
}

export function composeToolbar(ctx: ChromeContext): string {
  const row = ROW.map((f) => (f === "sep" ? '<span class="ni-tb-sep ni-ed-only" data-only="long"></span>' : rowButton(ctx, f))).join("");
  return (
    `<div class="ni-compose-bar">${mediaButton(ctx, "images")}${mediaButton(ctx, "audios")}<span class="ni-tb-sep ni-ed-only"></span>${row}${moreMenu(ctx)}` +
    `<span class="ni-sp"></span><span class="ni-compose-count" data-compose-count hidden></span>${modeToggle(ctx)}` +
    `<button type="submit" class="ni-btn ni-btn-primary">${escapeHtml(ctx.intl.t("compose.publish"))}</button></div>`
  );
}
