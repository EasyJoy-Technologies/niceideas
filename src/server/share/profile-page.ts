import { GLOSSARY } from "@/i18n/glossary";
import type { ProfileStats } from "@/server/db/repos/feed";
import type { Profile } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { feedList } from "./feed-list";
import { followButton } from "./follow-button";
import { icon } from "./icons";
import type { FeedPage } from "./load-feed";
import type { RepliesPage } from "./load-profile-lists";
import { profileTabs, type ProfileTab } from "./profile-tabs";
import { repliesList } from "./reply-card";
import { pageHead, siteUrl } from "./page-head";
import { avatarHtml, profilePath } from "./profile-bits";

/** The selected tab's list: post cards (all, articles, reposts, bookmarks) or the account's comments (replies). */
export type ProfileList = { kind: "posts"; page: FeedPage } | { kind: "replies"; page: RepliesPage };
export type ProfileView = { profile: Profile; stats: ProfileStats; tab: ProfileTab; own: boolean; list: ProfileList; following?: boolean };

/** Own profile: Settings next to the avatar (where others see Follow). */
const settingsButton = (ctx: ChromeContext) =>
  `<a class="ni-btn ni-btn-ghost ni-prof-set" href="/settings">${icon("settings")}<span>${escapeHtml(ctx.intl.t("settings.title"))}</span></a>`;

/**
 * Public profile `/@handle` (approved v2 design; tabs: 2026-10-27 design): profile card, tabs (All, Articles,
 * Replies, Reposts; the owner also Bookmarks), the tab's list.
 */
export function renderProfilePage(ctx: ChromeContext, v: ProfileView, aside = ""): string {
  const { t, format } = ctx.intl;
  const p = v.profile;
  const name = p.display_name || `@${p.handle}`;
  const base = profilePath(p.handle);
  const num = (n: number) => escapeHtml(format.number(n, { notation: "compact", maximumFractionDigits: 1 }));
  const stat = (n: number, key: string) => `<span><b>${num(n)}</b> ${escapeHtml(t(`profile.stats.${key}`))}</span>`;
  const joined = escapeHtml(t("profile.joined", { date: format.dateTime(p.created_at, { year: "numeric", month: "long" }) }));
  const card =
    `<section class="ni-card ni-prof"><div class="ni-prof-banner"></div><div class="ni-prof-in">` +
    `<div class="ni-prof-row">${avatarHtml(name, p.avatar_url, 80, "ni-avatar ni-prof-ava")}${v.own && !ctx.restricted ? settingsButton(ctx) : followButton(ctx, p.handle, !!v.following)}</div><h1>${escapeHtml(name)}</h1><div class="ni-meta">@${escapeHtml(p.handle)}</div>` +
    (p.bio ? `<p class="ni-prof-bio">${escapeHtml(p.bio)}</p>` : "") +
    `<div class="ni-prof-facts"><span>${icon("calendar")}${joined}</span></div>` +
    `<div class="ni-prof-stats">${stat(v.stats.posts, "posts")}${stat(v.stats.following, "following")}${stat(v.stats.followers, "followers")}${stat(v.stats.likes, "likes")}</div>` +
    `</div>${profileTabs(ctx, base, v.tab, v.own)}</section>`;
  const title = `${name} (@${p.handle})`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: pageHead({ url: siteUrl(base), title, description: p.bio || t("common.tagline"), type: "profile", image: p.avatar_url }),
    main: `<main class="ni-main ni-feed-main">${card}${v.list.kind === "replies" ? repliesList(ctx, p, v.list.page, base) : feedList(ctx, v.list.page, base, v.tab)}</main>`,
    side: true,
    aside,
  });
}
