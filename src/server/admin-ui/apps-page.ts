import { appSettingsDetail, APP_SETTINGS_ACTION } from "@/server/admin/app-settings";
import { canConfigure } from "@/server/admin/roles";
import type { ApiClient, SourceAppRow } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { sourceAppName } from "@/server/share/source-apps";
import { knownApp, knownSourceApp } from "@/server/share/source-registry";
import { emptyRow, hiddenFields, notice, pill, table } from "./parts";
import { renderAdmin, type AdminContext } from "./shell";

const e = escapeHtml;
const GENERIC_ICON = "/brand/sources/third-party.svg";
type Note = "done" | "failed" | null;
export type AppsView = { own: readonly SourceAppRow[]; clients: readonly ApiClient[]; posts: Map<string, number>; notice: Note };

const appCell = (icon: string | null, name: string, sub: string) =>
  `<span class="ad-appc"><img src="${e(icon ?? GENERIC_ICON)}" width="24" height="24" alt=""><span><b>${e(name)}</b><small>${e(sub)}</small></span></span>`;
const site = (url: string | null) => (url ? `<a href="${e(url)}" target="_blank" rel="noopener">${e(url.replace(/^https:\/\//, ""))}</a>` : "—");
const state = (ctx: AdminContext, on: boolean) => pill(ctx.intl.t(on ? "admin.apps.shown" : "admin.apps.hidden"), on ? "ok" : "");

/** Our app's edit form: badge on / off, website, icon. */
function ownForm(ctx: AdminContext, a: SourceAppRow, name: string): string {
  const { t } = ctx.intl;
  const input = (n: string, label: string, value: string | null) =>
    `<label class="ad-field"><span>${e(t(label))}</span><input class="ad-in" name="${n}" value="${e(value ?? "")}" maxlength="500" autocomplete="off" dir="ltr"></label>`;
  return (
    `<details class="ni-menu ad-pop"><summary class="ad-act">${e(t("admin.apps.edit"))}</summary>` +
    `<form class="ad-pop-f" method="post" action="/admin">${hiddenFields({ action: APP_SETTINGS_ACTION, target: `app:${a.key}`, back: "/admin/apps" })}` +
    `<label class="ad-chk"><input type="checkbox" name="show" value="1"${a.show_badge ? " checked" : ""}>${e(t("admin.apps.showBadge", { app: name }))}</label>` +
    input("website", "admin.apps.website", a.website_url) + input("icon", "admin.apps.icon", a.icon_url) +
    `<button type="submit" class="ni-btn ni-btn-sm">${e(t("admin.apps.save"))}</button></form></details>`
  );
}

/** Third-party app: one button turning the badge on or off. */
function clientToggle(ctx: AdminContext, c: ApiClient): string {
  const fields = hiddenFields({ action: APP_SETTINGS_ACTION, target: `api:${c.client_id}`, show: c.show_badge ? "0" : "1", back: "/admin/apps" });
  return `<form method="post" action="/admin">${fields}<button type="submit" class="ad-act">${e(ctx.intl.t(c.show_badge ? "admin.apps.turnOff" : "admin.apps.turnOn"))}</button></form>`;
}

/**
 * Apps (admin settings): which apps' posts show "From <app>". Our apps (registered on their first share) with
 * website and icon; third-party apps (from the app directory) with an on / off switch. Admins change them.
 */
export function renderApps(ctx: AdminContext, v: AppsView): string {
  const { t, format, locale } = ctx.intl;
  const can = canConfigure(ctx.role);
  const count = (k: string) => e(format.number(v.posts.get(k) ?? 0));
  const head = (cols: string[]): [string, string?][] => [...cols.map((c): [string, string?] => [e(t(c)), c === "admin.col.posts" ? "n" : undefined]), ["", "a"]];
  const cols = ["admin.col.app", "admin.col.website", "admin.col.badge", "admin.col.posts"];
  const own = v.own.map((a) => {
    const name = sourceAppName(a.names, locale);
    return [appCell(a.icon_url, name, a.key), site(a.website_url), state(ctx, a.show_badge), count(`app:${a.key}`), can ? ownForm(ctx, a, name) : ""];
  });
  const clients = v.clients.map((c) => [appCell(c.logo_url, c.name, c.client_id), site(c.website_url), state(ctx, c.show_badge), count(`api:${c.client_id}`), can ? clientToggle(ctx, c) : ""]);
  const ownTable = table(head(cols), own, e(t("admin.apps.own")), e(t("admin.apps.ownHint")));
  const clientTable = clients.length
    ? table(head(cols), clients, e(t("admin.apps.thirdParty")), e(t("admin.apps.thirdPartyHint")))
    : `<section class="ad-cd"><h2>${e(t("admin.apps.thirdParty"))}</h2>${emptyRow(t("admin.apps.empty"))}</section>`;
  return renderAdmin(ctx, { section: "apps", title: t("admin.nav.apps"), main: notice(ctx, v.notice) + ownTable + clientTable });
}

/** Audit log "item" of an `app_settings` row: the app and its new badge state. */
export function appSettingsItem(ctx: AdminContext, detail: string): string {
  const d = appSettingsDetail(detail);
  if (!d) return "";
  const [kind, id] = [d.app.slice(0, 4), d.app.slice(4)];
  const own = kind === "app:" ? knownSourceApp(id) : undefined;
  const name = own ? sourceAppName(own.names, ctx.intl.locale) : kind === "api:" ? (knownApp(id)?.name ?? id) : id;
  return `${e(name)} · ${state(ctx, d.show)}`;
}
