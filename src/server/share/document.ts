import { directionOf } from "@/i18n/locales";
import { escapeHtml } from "@/server/render/escape";
import { APP_VERSION } from "@/server/version";
import { siteFooter, siteHeader, type ChromeContext } from "./chrome";

export type PageDocument = {
  title: string;
  /** Extra <head> markup (already escaped). */
  head?: string;
  /** <main> markup (already escaped). */
  main: string;
};

const asset = (path: string) => `${path}?v=${APP_VERSION}`;

/** Full HTML document of a server-rendered page: no framework JS, readable without JS. */
export function renderPage(ctx: ChromeContext, page: PageDocument): string {
  const { locale, t } = ctx.intl;
  // Labels the enhancement script needs (it carries no text of its own).
  const data = `data-close-label="${escapeHtml(t("share.action.close"))}" data-copied-label="${escapeHtml(t("share.action.copied"))}"`;
  return (
    `<!doctype html><html lang="${locale}" dir="${directionOf(locale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title>` +
    `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">` +
    `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><meta name="theme-color" content="#ffffff">` +
    `<link rel="stylesheet" href="${asset("/styles/fonts.css")}"><link rel="stylesheet" href="${asset("/styles/tokens.css")}">` +
    `<link rel="stylesheet" href="${asset("/styles/post-body.css")}"><link rel="stylesheet" href="${asset("/styles/share-page.css")}">` +
    `${page.head ?? ""}<script src="${asset("/scripts/share.js")}" defer></script></head>` +
    `<body ${data}>${siteHeader(ctx)}${page.main}${siteFooter(ctx)}</body></html>`
  );
}
