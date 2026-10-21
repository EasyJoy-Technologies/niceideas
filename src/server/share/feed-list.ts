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

const tabHref = (base: string, tab: FeedTab) => (tab === "all" ? base : `${base}?tab=${tab}`);

/** Tab strip: underlined tabs (profile card) or a segmented control (feed heading). */
export function feedTabs(ctx: ChromeContext, base: string, current: FeedTab, style: "tabs" | "seg"): string {
  const links = FEED_TABS.map((tab) => {
    const on = tab === current ? ' aria-current="page"' : "";
    return `<a href="${escapeHtml(tabHref(base, tab))}"${on}>${escapeHtml(ctx.intl.t(`feed.tab.${tab}`))}</a>`;
  }).join("");
  return `<nav class="ni-${style}">${links}</nav>`;
}

/**
 * One page of items on a single surface, separated by hairlines (no card per
 * item), plus a no-JS "load more" link. `lead` goes on top of the same surface
 * (the profile header).
 */
export function feedList(ctx: ChromeContext, page: FeedPage, base: string, tab: FeedTab, lead = ""): string {
  const { t } = ctx.intl;
  const items = page.items.length
    ? page.items.map((item) => feedCard(ctx, item)).join("")
    : `<p class="ni-feed-empty">${escapeHtml(t("feed.empty"))}</p>`;
  const list = `<section class="ni-card ni-feed">${lead}${items}</section>`;
  if (!page.next) return list;
  const href = `${tabHref(base, tab)}${tab === "all" ? "?" : "&"}before=${encodeURIComponent(page.next)}`;
  return `${list}<a class="ni-btn ni-btn-ghost ni-feed-more" href="${escapeHtml(href)}">${escapeHtml(t("feed.more"))}</a>`;
}
