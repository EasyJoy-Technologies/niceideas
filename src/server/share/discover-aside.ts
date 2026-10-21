import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { followingAmong } from "@/server/db/repos/follows";
import { hotArticles, suggestedAuthors } from "@/server/db/repos/suggest";
import type { FeedRow } from "@/server/db/repos/feed";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { cardTitle } from "./card";
import { followButton } from "./follow-button";
import { avatarHtml, profilePath } from "./profile-bits";

export type DiscoverAside = { authors: Profile[]; hot: FeedRow[] };

const AUTHORS = 3;
const HOT = 3;
const HOT_DAYS = 30;

export async function loadDiscoverAside(db: Db, viewerId: string | null): Promise<DiscoverAside> {
  const [authors, hot] = await Promise.all([suggestedAuthors(db, viewerId, AUTHORS), hotArticles(db, HOT_DAYS, HOT)]);
  return { authors, hot };
}

/** Right-column panels of feed pages (v3 design): authors to follow, popular articles. Empty panels are omitted. */
export async function renderDiscoverAside(ctx: ChromeContext, db: Db, a: DiscoverAside): Promise<string> {
  const { t, format } = ctx.intl;
  const followed = ctx.viewer ? await followingAmong(db, ctx.viewer.user_id, a.authors.map((p) => p.user_id)) : new Set<string>();
  const people = a.authors
    .map((p) => {
      const name = p.display_name || `@${p.handle}`;
      return (
        `<div class="ni-sug"><a href="${profilePath(p.handle)}">${avatarHtml(name, p.avatar_url, 40)}<span class="ni-who"><span class="ni-name">${escapeHtml(name)}</span>` +
        `<span class="ni-meta">@${escapeHtml(p.handle)}</span></span></a>${followButton(ctx, p.handle, followed.has(p.user_id), "ni-follow-sm")}</div>`
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
