import { GLOSSARY } from "@/i18n/glossary";
import { BIO_MAX, NAME_MAX, type ProfileEditError } from "@/server/profiles/update-profile";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { icon } from "./icons";

const signOut = (ctx: ChromeContext) =>
  `<form class="ni-card ni-settings ni-signout" method="post" action="/auth/sign-out"><button type="submit" class="ni-btn ni-btn-ghost">${icon("signOut")}<span>${escapeHtml(ctx.intl.t("auth.signOut"))}</span></button></form>`;

export const SETTINGS_ERRORS: readonly ProfileEditError[] = ["too_long"];
export type SettingsNotice = ProfileEditError | "saved" | null;

/**
 * Profile settings (name, bio; the handle is shown read-only) for the signed-in user; plain form, works without JS.
 * Sign out at the bottom (phones reach this page from their profile; the account menu is not in their header).
 */
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
    field(t("settings.handle"), `<div class="ni-handle-in ni-handle-ro"><span>@</span><input value="${escapeHtml(v.handle)}" readonly aria-readonly="true"></div>`, t("settings.handleHint")) +
    field(t("settings.bio"), `<textarea name="bio" rows="4" maxlength="${BIO_MAX}">${escapeHtml(v.bio)}</textarea>`) +
    `<div class="ni-settings-row"><button type="submit" class="ni-btn ni-btn-primary">${escapeHtml(t("settings.save"))}</button></div></form>`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main: `<main class="ni-main ni-feed-main"><div class="ni-feed-h"><h1>${escapeHtml(title)}</h1></div>${form}${signOut(ctx)}</main>`,
    side: true,
    analytics: false,
  });
}
