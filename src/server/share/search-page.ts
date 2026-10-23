import { GLOSSARY } from "@/i18n/glossary";
import type { Profile } from "@/server/db/schema";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { feedList } from "./feed-list";
import type { FeedPage } from "./load-feed";
import { avatarHtml, profilePath } from "./profile-bits";
import { searchBox } from "./search-box";

export const SEARCH_TYPES = ["posts", "people"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export type SearchView = { query: string; type: SearchType; posts: FeedPage | null; people: Profile[] | null };

function personRow(p: Profile): string {
  const name = p.display_name || `@${p.handle}`;
  const bio = p.bio ? `<p>${escapeHtml(p.bio)}</p>` : "";
  return (
    `<a class="ni-person" href="${profilePath(p.handle)}">${avatarHtml(name, p.avatar_url, 42)}` +
    `<span class="ni-who"><span class="ni-name">${escapeHtml(name)}</span><span class="ni-meta">@${escapeHtml(p.handle)}</span>${bio}</span></a>`
  );
}

function results(ctx: ChromeContext, v: SearchView, base: string): string {
  const { t } = ctx.intl;
  const empty = `<p class="ni-card ni-feed-empty">${escapeHtml(t("search.empty", { query: v.query }))}</p>`;
  if (v.type === "people") return v.people?.length ? `<section class="ni-card ni-people">${v.people.map(personRow).join("")}</section>` : empty;
  if (!v.posts?.items.length) return empty;
  return feedList(ctx, v.posts, base, "all");
}

/** Search page: query box, posts / people tabs, results (posts reuse the feed cards). */
export function renderSearchPage(ctx: ChromeContext, v: SearchView): string {
  const { t } = ctx.intl;
  const title = t("search.title");
  const q = encodeURIComponent(v.query);
  const tabs = SEARCH_TYPES.map((type) => {
    const on = type === v.type ? ' aria-current="page"' : "";
    return `<a href="/search?q=${q}${type === "posts" ? "" : `&type=${type}`}"${on}>${escapeHtml(t(`search.tab.${type}`))}</a>`;
  }).join("");
  const head = `<div class="ni-feed-h"><h1>${escapeHtml(title)}</h1>${v.query ? `<nav class="ni-seg">${tabs}</nav>` : ""}</div>`;
  const body = v.query ? results(ctx, v, `/search?q=${q}`) : `<p class="ni-card ni-feed-empty">${escapeHtml(t("search.hint"))}</p>`;
  return renderPage(ctx, {
    title: `${v.query ? `${v.query} · ` : ""}${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main: `<main class="ni-main ni-feed-main">${searchBox(ctx, v.query, "ni-search ni-search-page")}${head}${body}</main>`,
    side: true,
    query: v.query,
  });
}
