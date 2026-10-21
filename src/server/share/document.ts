import { directionOf } from "@/i18n/locales";
import { escapeHtml } from "@/server/render/escape";
import { APP_VERSION } from "@/server/version";
import { siteHeader, type ChromeContext } from "./chrome";
import { siteFooter, siteSide } from "./site-footer";

export type PageDocument = {
  title: string;
  /** Extra <head> markup (already escaped). */
  head?: string;
  /** <main> markup (already escaped). */
  main: string;
  /** Feed pages: wide screens get a sticky side column holding the footer content. */
  side?: boolean;
};

const asset = (path: string) => `${path}?v=${APP_VERSION}`;

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
  const main = page.side ? `<div class="ni-shell">${page.main}${siteSide(ctx)}</div>` : page.main;
  return (
    `<!doctype html><html lang="${locale}" dir="${directionOf(locale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title>` +
    `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">` +
    `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><meta name="theme-color" content="#ffffff">` +
    `<link rel="stylesheet" href="${asset("/styles/fonts.css")}"><link rel="stylesheet" href="${asset("/styles/tokens.css")}">` +
    `<link rel="stylesheet" href="${asset("/styles/post-body.css")}"><link rel="stylesheet" href="${asset("/styles/share-page.css")}"><link rel="stylesheet" href="${asset("/styles/interact.css")}"><link rel="stylesheet" href="${asset("/styles/feed.css")}">${page.side ? `<link rel="stylesheet" href="${asset("/styles/side.css")}">` : ""}` +
    `${page.head ?? ""}<script src="${asset("/scripts/share.js")}" defer></script><script src="${asset("/scripts/interact.js")}" defer></script></head>` +
    `<body ${data}>${siteHeader(ctx)}${main}${siteFooter(ctx, page.side)}</body></html>`
  );
}
