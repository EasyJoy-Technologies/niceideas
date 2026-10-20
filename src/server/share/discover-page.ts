import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { feedList, feedTabs, type FeedTab } from "./feed-list";
import type { FeedPage } from "./load-feed";
import { pageHead, siteUrl } from "./page-head";

/** Discover: every public post, newest first (signed-out home; approved v2 timeline cards). */
export function renderDiscoverPage(ctx: ChromeContext, tab: FeedTab, page: FeedPage, base: string): string {
  const { t } = ctx.intl;
  const title = t("discover.title");
  const heading = `<div class="ni-feed-h"><h1>${escapeHtml(title)}</h1>${feedTabs(ctx, base, tab, "seg")}</div>`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: pageHead({ url: siteUrl("/discover"), title: `${title} · ${GLOSSARY.brand}`, description: t("common.tagline"), type: "website", image: null }),
    main: `<main class="ni-main ni-feed-main">${heading}${feedList(ctx, page, base, tab)}</main>`,
  });
}
