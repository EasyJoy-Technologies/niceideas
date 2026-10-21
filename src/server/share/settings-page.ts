import { GLOSSARY } from "@/i18n/glossary";
import { BIO_MAX, NAME_MAX, type ProfileEditError } from "@/server/profiles/update-profile";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";

export const SETTINGS_ERRORS: readonly ProfileEditError[] = ["handle_invalid", "handle_taken", "too_long"];
export type SettingsNotice = ProfileEditError | "saved" | null;

/** Profile settings (name, handle, bio) for the signed-in user; plain form, works without JS. */
export function renderSettingsPage(ctx: ChromeContext, notice: SettingsNotice): string {
  const { t } = ctx.intl;
  const v = ctx.viewer!;
  const title = t("settings.title");
  const msg = notice
    ? `<p class="${notice === "saved" ? "ni-ok" : "ni-compose-err"}" role="status">${escapeHtml(t(notice === "saved" ? "settings.saved" : `settings.error.${notice}`))}</p>`
    : "";
  const field = (label: string, input: string, hint = "") =>
    `<label class="ni-field"><span>${escapeHtml(label)}</span>${input}${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</label>`;
  const form =
    `<form class="ni-card ni-settings" method="post" action="/settings">${msg}` +
    field(t("settings.name"), `<input name="displayName" maxlength="${NAME_MAX}" value="${escapeHtml(v.display_name)}">`) +
    field(t("settings.handle"), `<div class="ni-handle-in"><span>@</span><input name="handle" required minlength="3" maxlength="30" pattern="[a-z0-9_]{3,30}" value="${escapeHtml(v.handle)}" autocapitalize="off" spellcheck="false"></div>`, t("settings.handleHint")) +
    field(t("settings.bio"), `<textarea name="bio" rows="4" maxlength="${BIO_MAX}">${escapeHtml(v.bio)}</textarea>`) +
    `<div class="ni-settings-row"><button type="submit" class="ni-btn ni-btn-primary">${escapeHtml(t("settings.save"))}</button></div></form>`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main: `<main class="ni-main ni-feed-main"><div class="ni-feed-h"><h1>${escapeHtml(title)}</h1></div>${form}</main>`,
    side: true,
  });
}
