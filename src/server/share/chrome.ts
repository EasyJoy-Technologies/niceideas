import { GLOSSARY } from "@/i18n/glossary";
import { LOCALES } from "@/i18n/locales";
import type { Profile } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import { headerAccount } from "./account-menu";
import { unreadBadge } from "./site-columns";
import { icon } from "./icons";
import { LANG_PARAM, type PageIntl } from "./locale";

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
};

const LOCKUP = { src: "/brand/lockup.svg", width: 918, height: 168 };
const MARK_SRC = "/brand/mark.svg";

const autonym = (code: string) => new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;

export function brand(ctx: ChromeContext, heightRem: number, compact = false): string {
  const w = ((LOCKUP.width / LOCKUP.height) * heightRem * 16).toFixed(0);
  // Phones show the mark only (header room for 40 languages); the footer keeps the full lockup.
  const phone = compact ? `<source media="(max-width: 47.99rem)" srcset="${MARK_SRC}" width="${heightRem * 16}" height="${heightRem * 16}">` : "";
  const img = `<picture>${phone}<img src="${LOCKUP.src}" alt="${GLOSSARY.brand}" width="${w}" height="${heightRem * 16}"></picture>`;
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

export function siteHeader(ctx: ChromeContext): string {
  // Mainland-China visitors get no in-site navigation (plan §4.2). Phones show the icon only.
  const current = ctx.path === "/discover" || ctx.path === "/" ? ' aria-current="page"' : "";
  const label = escapeHtml(ctx.intl.t("discover.title"));
  const discover = ctx.restricted ? "" : `<a class="ni-hdr-nav" href="/discover" aria-label="${label}"${current}>${icon("compass")}<span>${label}</span></a>`;
  const searchLabel = escapeHtml(ctx.intl.t("search.title"));
  const search = ctx.restricted ? "" : `<a class="ni-hdr-nav ni-hdr-search" href="/search" aria-label="${searchLabel}"${ctx.path === "/search" ? ' aria-current="page"' : ""}>${icon("search")}</a>`;
  const bellLabel = escapeHtml(ctx.intl.t("notifications.title"));
  const bell = ctx.viewer && !ctx.restricted ? `<a class="ni-hdr-nav" href="/notifications" aria-label="${bellLabel}"${ctx.path === "/notifications" ? ' aria-current="page"' : ""}>${icon("bell")}${unreadBadge(ctx)}</a>` : "";
  return `<header class="ni-hdr"><div class="ni-hdr-in">${brand(ctx, 1.875, true)}<span class="ni-sp"></span>${discover}${search}${bell}${languageMenu(ctx)}${headerAccount(ctx)}</div></header>`;
}
