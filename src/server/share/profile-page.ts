import { GLOSSARY } from "@/i18n/glossary";
import type { ProfileStats } from "@/server/db/repos/feed";
import type { Profile } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { feedList, feedTabs, type FeedTab } from "./feed-list";
import { icon } from "./icons";
import type { FeedPage } from "./load-feed";
import { pageHead, siteUrl } from "./page-head";
import { avatarHtml, profilePath } from "./profile-bits";

export type ProfileView = { profile: Profile; stats: ProfileStats; tab: FeedTab; page: FeedPage };

/** Public profile `/@handle` (approved v2 design, signed-out view): profile card, tabs, posts. */
export function renderProfilePage(ctx: ChromeContext, v: ProfileView): string {
  const { t, format } = ctx.intl;
  const p = v.profile;
  const name = p.display_name || `@${p.handle}`;
  const base = profilePath(p.handle);
  const num = (n: number) => escapeHtml(format.number(n, { notation: "compact", maximumFractionDigits: 1 }));
  const stat = (n: number, key: string) => `<span><b>${num(n)}</b> ${escapeHtml(t(`profile.stats.${key}`))}</span>`;
  const joined = escapeHtml(t("profile.joined", { date: format.dateTime(p.created_at, { year: "numeric", month: "long" }) }));
  const card =
    `<section class="ni-card ni-prof"><div class="ni-prof-banner"></div><div class="ni-prof-in">` +
    `${avatarHtml(name, p.avatar_url, 104, "ni-avatar ni-prof-ava")}<h1>${escapeHtml(name)}</h1><div class="ni-meta">@${escapeHtml(p.handle)}</div>` +
    (p.bio ? `<p class="ni-prof-bio">${escapeHtml(p.bio)}</p>` : "") +
    `<div class="ni-prof-facts"><span>${icon("calendar")}${joined}</span></div>` +
    `<div class="ni-prof-stats">${stat(v.stats.posts, "posts")}${stat(v.stats.following, "following")}${stat(v.stats.followers, "followers")}${stat(v.stats.likes, "likes")}</div>` +
    `</div>${feedTabs(ctx, base, v.tab, "tabs")}</section>`;
  const title = `${name} (@${p.handle})`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: pageHead({ url: siteUrl(base), title, description: p.bio || t("common.tagline"), type: "profile", image: p.avatar_url }),
    main: `<main class="ni-main ni-feed-main">${card}${feedList(ctx, v.page, base, v.tab)}</main>`,
  });
}
