import { GLOSSARY } from "@/i18n/glossary";
import { directionOf } from "@/i18n/locales";
import { canModerate } from "@/server/admin/roles";
import { getConfig } from "@/server/config/env";
import type { AdminRole } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { languageMenu, type ChromeContext } from "@/server/share/chrome";
import { asset } from "@/server/share/document";
import { icon, type IconName } from "@/server/share/icons";
import { avatarHtml, profilePath } from "@/server/share/profile-bits";
import { themeHead } from "@/server/share/theme";
import { themeMenu } from "@/server/share/theme-menu";
import { reasonList } from "./parts";

export type AdminSection = "overview" | "posts" | "comments" | "reports" | "bans" | "audit";
export const ADMIN_SECTIONS: readonly AdminSection[] = ["overview", "posts", "comments", "reports", "bans", "audit"];

/** Page context of the admin console: the viewer's role and the open-report badge. */
export type AdminContext = ChromeContext & { role: AdminRole; openReports: number };

const NAV: { group: "content" | "moderation" | null; items: [AdminSection, IconName][] }[] = [
  { group: null, items: [["overview", "dashboard"]] },
  { group: "content", items: [["posts", "fileText"], ["comments", "comment"]] },
  { group: "moderation", items: [["reports", "flag"], ["bans", "restricted"], ["audit", "bulletList"]] },
];

export const sectionHref = (s: AdminSection) => (s === "overview" ? "/admin" : `/admin/${s}`);

/** Account row: avatar, name, role; "…" opens back-to-site, own profile and sign-out. */
function accountRow(ctx: AdminContext): string {
  const { t } = ctx.intl;
  const v = ctx.viewer!;
  const name = v.display_name || `@${v.handle}`;
  const items =
    `<ul><li><a href="/">${icon("outLink")}${escapeHtml(t("admin.backToSite"))}</a></li>` +
    `<li><a href="${profilePath(v.handle)}">${icon("person")}${escapeHtml(t("auth.myProfile"))}</a></li>` +
    `<li><form method="post" action="/auth/sign-out"><button type="submit">${icon("signOut")}${escapeHtml(t("auth.signOut"))}</button></form></li></ul>`;
  return (
    `<details class="ni-menu ad-me"><summary aria-label="${escapeHtml(t("auth.accountMenu"))}">${avatarHtml(name, v.avatar_url, 32)}` +
    `<span class="ad-who"><b>${escapeHtml(name)}</b><small>${escapeHtml(t(`admin.role.${ctx.role}`))}</small></span>${icon("more")}</summary>${items}</details>`
  );
}

/**
 * Left sidebar (approved variant A, round 7): brand, navigation; at the bottom one block
 * of language + appearance (same settings as the site) above the account row.
 */
function sidebar(ctx: AdminContext, current: AdminSection): string {
  const { t } = ctx.intl;
  const appEnv = getConfig().APP_ENV;
  const env = appEnv === "test" ? "development" : appEnv;
  const nav = NAV.map(({ group, items }) =>
    (group ? `<div class="ad-ng">${escapeHtml(t(`admin.group.${group}`))}</div>` : "") +
    items
      .map(([s, ico]) => {
        const n = ctx.openReports;
        const badge = s === "reports" && n > 0 ? `<span class="ad-bd">${n > 99 ? "99+" : n}</span>` : "";
        return `<a class="ad-ni" href="${sectionHref(s)}"${s === current ? ' aria-current="page"' : ""}>${icon(ico)}<span>${escapeHtml(t(`admin.nav.${s}`))}</span>${badge}</a>`;
      })
      .join(""),
  ).join("");
  const brand =
    `<a class="ad-brand" href="/admin"><img src="/brand/mark.svg" width="36" height="36" alt=""><span>${GLOSSARY.brand}` +
    `<small>${escapeHtml(t("admin.console"))} · ${escapeHtml(t(`admin.env.${env}`))}</small></span></a>`;
  return `<aside class="ad-sb">${brand}<nav class="ad-nav">${nav}</nav><div class="ad-foot"><div class="ad-tools">${languageMenu(ctx)}${themeMenu(ctx, true)}</div>${accountRow(ctx)}</div></aside>`;
}

export type AdminPage = { section: AdminSection; title: string; tools?: string; main: string };

/** Full admin console document (own shell, not the site's); readable and usable without JS. */
export function renderAdmin(ctx: AdminContext, page: AdminPage): string {
  const { locale, t } = ctx.intl;
  const css = ["/styles/fonts.css", "/styles/tokens.css", "/styles/share-page.css", "/styles/account.css", "/styles/search.css", "/styles/nav.css", "/styles/admin.css"]
    .map((s) => `<link rel="stylesheet" href="${asset(s)}">`)
    .join("");
  const readOnly = ctx.role === "viewer" ? `<span class="ad-pill">${escapeHtml(t("admin.readOnly"))}</span>` : "";
  return (
    `<!doctype html><html lang="${locale}" dir="${directionOf(locale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(`${page.title} · ${t("admin.console")} · ${GLOSSARY.brand}`)}</title>` +
    `<meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">` +
    `${css}${themeHead(ctx.theme, asset("/styles/dark.css"))}<script src="${asset("/scripts/share.js")}" defer></script></head>` +
    `<body class="ad"><div class="ad-app">${sidebar(ctx, page.section)}<div class="ad-mn"><header class="ad-tb"><h1>${escapeHtml(page.title)}</h1>${readOnly}` +
    `<span class="ni-sp"></span>${page.tools ?? ""}</header><main class="ad-ct">${page.main}</main></div></div>${canModerate(ctx.role) ? reasonList(ctx) : ""}</body></html>`
  );
}
