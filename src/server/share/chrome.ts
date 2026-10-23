import { GLOSSARY } from "@/i18n/glossary";
import { LOCALES } from "@/i18n/locales";
import type { Profile } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { headerAccount } from "./account-menu";
import { headerSearch } from "./search-box";
import { themeMenu } from "./theme-menu";
import { unreadBadge } from "./site-columns";
import { icon } from "./icons";
import { LANG_PARAM, type PageIntl } from "./locale";
import type { Theme } from "./theme";

/** Page context shared by every server-rendered page. */
export type ChromeContext = {
  intl: PageIntl;
  /** Mainland-China visitor: no in-site navigation at all (plan §4.2). */
  restricted: boolean;
  /** Signed-in profile (web session), if any. Never set for mainland-China visitors. */
  viewer?: Profile | null;
  /** Unread notifications of the viewer (badge). */
  unread?: number;
  /** Path of the current page (language links stay on it). */
  path: string;
  /** Colour theme preference (cookie; default: follow the system). */
  theme: Theme;
};

const LOCKUP = { src: "/brand/lockup.svg", width: 918, height: 168 };
const LOCKUP_DARK = "/brand/lockup-dark.svg";
const MARK_SRC = "/brand/mark.svg";

const autonym = (code: string) => new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;

/**
 * Logo lockup (dark variant for the dark theme). `compact`: very narrow phones show the
 * mark only; otherwise the name stays next to it.
 */
export function brand(ctx: ChromeContext, heightRem: number, compact = false): string {
  const h = heightRem * 16;
  const w = ((LOCKUP.width / LOCKUP.height) * h).toFixed(0);
  const mark = compact ? `<source media="(max-width: 22.49rem)" srcset="${MARK_SRC}" width="${h}" height="${h}">` : "";
  const dark = ctx.theme === "auto" ? `<source media="(prefers-color-scheme: dark)" srcset="${LOCKUP_DARK}">` : "";
  const src = ctx.theme === "dark" ? LOCKUP_DARK : LOCKUP.src;
  const img = `<picture>${mark}${dark}<img src="${src}" alt="${GLOSSARY.brand}" width="${w}" height="${h}"></picture>`;
  return ctx.restricted ? `<span class="ni-brand">${img}</span>` : `<a class="ni-brand" href="/">${img}</a>`;
}

/** No-JS language menu; a choice is remembered (cookie, /api/web/lang) and returns to the same page. */
export function languageMenu(ctx: ChromeContext): string {
  const { t, locale } = ctx.intl;
  const items = LOCALES.map((code) => {
    const current = code === locale ? ' aria-current="true"' : "";
    const href = `/api/web/lang?${LANG_PARAM}=${encodeURIComponent(code)}&next=${encodeURIComponent(ctx.path)}`;
    return `<li><a href="${escapeHtml(href)}" hreflang="${code}" lang="${code}" rel="nofollow"${current}>${escapeHtml(autonym(code))}</a></li>`;
  }).join("");
  return (
    `<details class="ni-lang"><summary aria-label="${escapeHtml(t("share.language"))}">${icon("globe")}` +
    `<span>${escapeHtml(autonym(locale))}</span></summary><ul>${items}</ul></details>`
  );
}

/**
 * Site header (below the wide-screen shell): brand, discover, search, notifications, language,
 * theme, account. Phones with the bottom tab bar keep brand, search, language and theme only
 * (the rest is in the tab bar). Mainland-China visitors get no in-site navigation (plan §4.2).
 */
export function siteHeader(ctx: ChromeContext): string {
  const current = ctx.path === "/discover" || ctx.path === "/" ? ' aria-current="page"' : "";
  const label = escapeHtml(ctx.intl.t("discover.title"));
  const discover = ctx.restricted ? "" : `<a class="ni-hdr-nav ni-tabbed" href="/discover" aria-label="${label}"${current}>${icon("compass")}<span>${label}</span></a>`;
  const bellLabel = escapeHtml(ctx.intl.t("notifications.title"));
  const bell = ctx.viewer && !ctx.restricted ? `<a class="ni-hdr-nav ni-tabbed" href="/notifications" aria-label="${bellLabel}"${ctx.path === "/notifications" ? ' aria-current="page"' : ""}>${icon("bell")}${unreadBadge(ctx)}</a>` : "";
  return (
    `<header class="ni-hdr"><div class="ni-hdr-in">${brand(ctx, 1.875, true)}<span class="ni-sp"></span>${discover}${headerSearch(ctx)}${bell}` +
    `${languageMenu(ctx)}${themeMenu(ctx)}${headerAccount(ctx)}</div></header>`
  );
}
