import { directionOf } from "@/i18n/locales";
import { escapeHtml } from "@/server/render/escape";
import { APP_VERSION } from "@/server/version";
import { siteHeader, type ChromeContext } from "./chrome";
import { searchBox } from "./search-box";
import { siteAside, siteRail } from "./site-columns";
import { siteFooter } from "./site-footer";
import { phoneTabBar } from "./tab-bar";
import { themeHead } from "./theme";

export type PageDocument = {
  title: string;
  /** Extra <head> markup (already escaped). */
  head?: string;
  /** <main> markup (already escaped). */
  main: string;
  /** Feed pages: wide screens use the three-column shell (rail, feed, aside). */
  side?: boolean;
  /** Extra right-column panels under the search box (already escaped). */
  aside?: string;
  /** Current search query (prefills the right-column search box). */
  query?: string;
  /** Replacement header / footer (already escaped); default: site header and footer. */
  header?: string;
  footer?: string;
  /** Extra same-origin stylesheets (paths under /styles). */
  stylesheets?: string[];
  /** Extra same-origin deferred scripts (paths under /scripts). */
  scripts?: string[];
  /** Phone bottom tab bar; default: on for feed pages (`side`). The post page has its own action bar. */
  tabBar?: boolean;
};

/** Same-origin asset URL with the release as cache buster. */
export const asset = (path: string) => `${path}?v=${APP_VERSION}`;

/** Full HTML document of a server-rendered page: no framework JS, readable without JS. */
export function renderPage(ctx: ChromeContext, page: PageDocument): string {
  const { locale, t } = ctx.intl;
  // Labels the enhancement script needs (it carries no text of its own).
  const label = (name: string, key: string, values?: Record<string, string>) => `data-${name}-label="${escapeHtml(t(key, values))}"`;
  const data = [
    label("close", "share.action.close"),
    label("copied", "share.action.copied"),
    // `{name}` stays a placeholder for the script to fill in.
    label("reply-to", "share.comments.replyingTo", { name: "{name}" }),
    label("comment-error", "share.comments.error"),
    label("rate-limited", "share.comments.rateLimited"),
    label("report-done", "share.report.done"),
  ].join(" ");
  const main = page.side ? `<div class="ni-shell">${siteRail(ctx)}${page.main}${siteAside(ctx, searchBox(ctx, page.query) + (page.aside ?? ""))}</div>` : page.main;
  return (
    `<!doctype html><html lang="${locale}" dir="${directionOf(locale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title>` +
    `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">` +
    `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">` +
    `<link rel="stylesheet" href="${asset("/styles/fonts.css")}"><link rel="stylesheet" href="${asset("/styles/tokens.css")}">` +
    `<link rel="stylesheet" href="${asset("/styles/post-body.css")}"><link rel="stylesheet" href="${asset("/styles/share-page.css")}"><link rel="stylesheet" href="${asset("/styles/interact.css")}"><link rel="stylesheet" href="${asset("/styles/feed.css")}"><link rel="stylesheet" href="${asset("/styles/account.css")}"><link rel="stylesheet" href="${asset("/styles/search.css")}"><link rel="stylesheet" href="${asset("/styles/nav.css")}">${ctx.viewer ? `<link rel="stylesheet" href="${asset("/styles/compose.css")}"><link rel="stylesheet" href="${asset("/styles/settings.css")}"><link rel="stylesheet" href="${asset("/styles/notifications.css")}">` : ""}${page.side ? `<link rel="stylesheet" href="${asset("/styles/shell.css")}"><link rel="stylesheet" href="${asset("/styles/aside.css")}">` : ""}` +
    `${(page.stylesheets ?? []).map((s) => `<link rel="stylesheet" href="${asset(s)}">`).join("")}${themeHead(ctx.theme, asset("/styles/dark.css"))}${page.head ?? ""}<script src="${asset("/scripts/share.js")}" defer></script><script src="${asset("/scripts/interact.js")}" defer></script>${(page.scripts ?? []).map((s) => `<script src="${asset(s)}" defer></script>`).join("")}</head>` +
    `<body ${data}>${page.header ?? siteHeader(ctx)}${main}${page.footer ?? siteFooter(ctx, page.side)}${(page.tabBar ?? !!page.side) ? phoneTabBar(ctx) : ""}</body></html>`
  );
}
