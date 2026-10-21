import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { feedList, feedTabs, type FeedTab } from "./feed-list";
import type { FeedPage } from "./load-feed";
import { pageHead, siteUrl } from "./page-head";

export type FeedPageKind = "discover" | "home";

/** Discover (every public post) or the signed-in home timeline (own + followed authors), newest first. */
export function renderDiscoverPage(ctx: ChromeContext, tab: FeedTab, page: FeedPage, base: string, aside = "", kind: FeedPageKind = "discover"): string {
  const { t } = ctx.intl;
  const title = t(kind === "home" ? "nav.home" : "discover.title");
  const heading = `<div class="ni-feed-h"><h1>${escapeHtml(title)}</h1>${feedTabs(ctx, base, tab, "seg")}</div>`;
  const empty = kind === "home" && page.items.length === 0 ? `<p class="ni-card ni-feed-empty">${escapeHtml(t("home.empty"))}</p>` : "";
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: pageHead({ url: siteUrl(kind === "home" ? "/" : "/discover"), title: `${title} · ${GLOSSARY.brand}`, description: t("common.tagline"), type: "website", image: null }),
    main: `<main class="ni-main ni-feed-main">${heading}${empty || feedList(ctx, page, base, tab)}</main>`,
    side: true,
    aside,
  });
}
