import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { followingAmong } from "@/server/db/repos/follows";
import { hotArticles, suggestedAuthors } from "@/server/db/repos/suggest";
import type { FeedRow } from "@/server/db/repos/feed";
import { escapeHtml } from "@/server/render/escape";
import { ttlCache } from "@/server/util/ttl-cache";
import type { ChromeContext } from "./chrome";
import { cardTitle } from "./card";
import { followButton } from "./follow-button";
import { avatarHtml, profilePath } from "./profile-bits";

export type DiscoverAside = { authors: Profile[]; hot: FeedRow[] };

const AUTHORS = 3;
/** Cached candidates; the viewer's own profile and followed authors are filtered out per request. */
const CANDIDATES = 30;
const HOT = 3;
const HOT_DAYS = 30;

// Site-wide rankings are the same for everyone, so they are computed at most once per TTL per process.
const ttl = () => getConfig().ASIDE_CACHE_SECONDS * 1000;
const authorCache = ttlCache<Profile[]>(ttl, 1);
const hotCache = ttlCache<FeedRow[]>(ttl, 1);

export async function loadDiscoverAside(db: Db, viewerId: string | null): Promise<DiscoverAside> {
  const [candidates, hot] = await Promise.all([
    authorCache.get("all", () => suggestedAuthors(db, null, CANDIDATES)),
    hotCache.get("all", () => hotArticles(db, HOT_DAYS, HOT)),
  ]);
  if (!viewerId) return { authors: candidates.slice(0, AUTHORS), hot };
  const others = candidates.filter((p) => p.user_id !== viewerId);
  const followed = await followingAmong(db, viewerId, others.map((p) => p.user_id));
  return { authors: others.filter((p) => !followed.has(p.user_id)).slice(0, AUTHORS), hot };
}

/** Test hook. */
export function clearAsideCacheForTests(): void {
  authorCache.clear();
  hotCache.clear();
}

/** Right-column panels of feed pages (v3 design): authors to follow (never followed ones), popular articles. Empty panels are omitted. */
export function renderDiscoverAside(ctx: ChromeContext, a: DiscoverAside): string {
  const { t, format } = ctx.intl;
  const people = a.authors
    .map((p) => {
      const name = p.display_name || `@${p.handle}`;
      return (
        `<div class="ni-sug"><a href="${profilePath(p.handle)}">${avatarHtml(name, p.avatar_url, 40)}<span class="ni-who"><span class="ni-name">${escapeHtml(name)}</span>` +
        `<span class="ni-meta">@${escapeHtml(p.handle)}</span></span></a>${followButton(ctx, p.handle, false, "ni-follow-sm")}</div>`
      );
    })
    .join("");
  const hot = a.hot
    .map((p) => `<a class="ni-mini ni-mini-text" href="/p/${p.slug}"><span><b>${escapeHtml(cardTitle(p))}</b><small>${escapeHtml(p.author_name || `@${p.author_handle}`)} · ${escapeHtml(format.dateTime(p.published_at, { dateStyle: "medium" }))}</small></span></a>`)
    .join("");
  return (
    (people ? `<section class="ni-card ni-box"><h2>${escapeHtml(t("aside.suggested"))}</h2>${people}</section>` : "") +
    (hot ? `<section class="ni-card ni-box"><h2>${escapeHtml(t("aside.hot"))}</h2>${hot}</section>` : "")
  );
}
