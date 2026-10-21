import type { FeedFilter } from "@/server/db/repos/feed";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { feedCard } from "./feed-card";
import type { FeedPage } from "./load-feed";

export const FEED_TABS = ["all", "articles", "images"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

/** `?tab=` → tab (unknown values fall back to "all"). */
export function feedTab(url: URL): FeedTab {
  const v = url.searchParams.get("tab");
  return (FEED_TABS as readonly string[]).includes(v ?? "") ? (v as FeedTab) : "all";
}

export function tabFilter(tab: FeedTab): FeedFilter {
  if (tab === "articles") return { kind: "article" };
  if (tab === "images") return { withCover: true };
  return {};
}

const tabHref = (base: string, tab: FeedTab) => (tab === "all" ? base : `${base}${base.includes("?") ? "&" : "?"}tab=${tab}`);

/** Tab strip: underlined tabs (profile card) or a segmented control (feed heading). */
export function feedTabs(ctx: ChromeContext, base: string, current: FeedTab, style: "tabs" | "seg"): string {
  const links = FEED_TABS.map((tab) => {
    const on = tab === current ? ' aria-current="page"' : "";
    return `<a href="${escapeHtml(tabHref(base, tab))}"${on}>${escapeHtml(ctx.intl.t(`feed.tab.${tab}`))}</a>`;
  }).join("");
  return `<nav class="ni-${style}">${links}</nav>`;
}

/** Cards of one page plus a no-JS "load more" link (keyset cursor). */
export function feedList(ctx: ChromeContext, page: FeedPage, base: string, tab: FeedTab): string {
  const { t } = ctx.intl;
  if (page.items.length === 0) return `<p class="ni-card ni-feed-empty">${escapeHtml(t("feed.empty"))}</p>`;
  const cards = page.items.map((item) => feedCard(ctx, item)).join("");
  if (!page.next) return cards;
  const first = tabHref(base, tab);
  const href = `${first}${first.includes("?") ? "&" : "?"}before=${encodeURIComponent(page.next)}`;
  return `${cards}<a class="ni-btn ni-btn-ghost ni-feed-more" href="${escapeHtml(href)}">${escapeHtml(t("feed.more"))}</a>`;
}
