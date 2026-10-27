import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { tabHref } from "./feed-list";

/** Profile tabs (2026-10-27 design). Bookmarks are private: only on the owner's own profile. */
export const PROFILE_TABS = ["all", "articles", "replies", "reposts", "bookmarks"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

const tabsFor = (own: boolean): readonly ProfileTab[] => (own ? PROFILE_TABS : PROFILE_TABS.filter((t) => t !== "bookmarks"));

/** `?tab=` → tab; unknown values (and Bookmarks on someone else's profile) fall back to "all". */
export function profileTab(url: URL, own: boolean): ProfileTab {
  const v = url.searchParams.get("tab");
  return (tabsFor(own) as readonly string[]).includes(v ?? "") ? (v as ProfileTab) : "all";
}

/** Underlined tabs of equal width (phones: they scroll sideways when a language's labels do not fit). */
export function profileTabs(ctx: ChromeContext, base: string, current: ProfileTab, own: boolean): string {
  const links = tabsFor(own).map((tab) => {
    const on = tab === current ? ' aria-current="page"' : "";
    return `<a href="${escapeHtml(tabHref(base, tab))}"${on}>${escapeHtml(ctx.intl.t(`feed.tab.${tab}`))}</a>`;
  }).join("");
  return `<nav class="ni-tabs ni-tabs-even">${links}</nav>`;
}
