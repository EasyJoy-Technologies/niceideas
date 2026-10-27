import { randomUUID } from "node:crypto";
import { silentSignInTarget } from "@/server/auth/web/sign-in-flow";
import { getDb } from "@/server/db";
import { profileStats } from "@/server/db/repos/feed";
import { followingAmong } from "@/server/db/repos/follows";
import { findProfileByHandle } from "@/server/db/repos/profiles";
import { searchProfiles } from "@/server/db/repos/search";
import { HANDLE_PATTERN } from "@/server/profiles/handles";
import { peekVisitorKey } from "@/server/interactions/visitor";
import { homeCompose } from "./home-compose";
import { loadDiscoverAside, renderDiscoverAside } from "./discover-aside";
import { renderDiscoverPage, type FeedPageKind } from "./discover-page";
import { feedTab, tabFilter } from "./feed-list";
import { loadFeed, parseCursor, type FeedViewer } from "./load-feed";
import type { ChromeContext } from "./chrome";
import { renderProfilePage } from "./profile-page";
import { loadProfileList } from "./profile-list";
import { profileTab } from "./profile-tabs";
import { renderSearchPage, type SearchType, type SearchView } from "./search-page";
import { cachedPage } from "./page-cache";
import { htmlResponse, pageContext } from "./respond";
import { renderStatusPage } from "./status-page";

const HANDLE = HANDLE_PATTERN;

/** Whose likes and bookmarks the cards show: the signed-in viewer's and this browser's. */
export const feedViewer = (ctx: ChromeContext, request: Request): FeedViewer => ({ viewerId: ctx.viewer?.user_id ?? null, visitorKey: peekVisitorKey(request.headers) });

async function guarded(request: Request, render: () => Promise<Response>): Promise<Response> {
  // Signed-out browser, first site-page visit: try SSO with other NiceMatrix sites (prompt=none) once.
  const silent = silentSignInTarget(request);
  if (silent) return new Response(null, { status: 303, headers: { Location: silent, "Cache-Control": "no-store" } });
  try {
    return await render();
  } catch (err) {
    console.error(`[share] feed page failed errorId=${randomUUID()}`, err);
    throw err;
  }
}

/** Discover. Site page: 451 in mainland China via src/proxy.ts. */
export async function discoverResponse(request: Request): Promise<Response> {
  return feedResponse(request, "discover");
}

/** `/`: home timeline when signed in, Discover otherwise. */
export async function homeResponse(request: Request): Promise<Response> {
  return feedResponse(request, "home");
}

async function feedResponse(request: Request, want: FeedPageKind): Promise<Response> {
  return guarded(request, async () => {
    const ctx = await pageContext(request, "site");
    return cachedPage(request, ctx, async () => {
      const db = getDb();
      const kind: FeedPageKind = want === "home" && ctx.viewer ? "home" : "discover";
      const base = kind === "home" ? "/" : "/discover";
      const url = new URL(request.url);
      const tab = feedTab(url);
      const filter = kind === "home" ? { ...tabFilter(tab), followerId: ctx.viewer!.user_id } : tabFilter(tab);
      const [page, asideData] = await Promise.all([
        loadFeed(db, filter, parseCursor(url.searchParams.get("before")), feedViewer(ctx, request)),
        loadDiscoverAside(db, ctx.viewer?.user_id ?? null),
      ]);
      const compose = kind === "home" ? await homeCompose(ctx, db, url) : "";
      return { html: renderDiscoverPage(ctx, tab, page, base, renderDiscoverAside(ctx, asideData), kind, compose), status: 200 };
    });
  });
}

/** Public profile; `/@handle` is rewritten here by src/proxy.ts. */
export async function profileResponse(request: Request, rawHandle: string): Promise<Response> {
  return guarded(request, async () => {
    const handle = rawHandle.toLowerCase();
    const ctx = await pageContext(request, "site");
    const pctx = { ...ctx, path: `/@${handle}` };
    return cachedPage(request, pctx, async () => {
      const db = getDb();
      const profile = HANDLE.test(handle) ? await findProfileByHandle(db, handle) : undefined;
      if (!profile || profile.status !== "active") return { html: renderStatusPage(pctx, "profileNotFound"), status: 404 };
      const url = new URL(request.url);
      const own = ctx.viewer?.user_id === profile.user_id;
      const tab = profileTab(url, own);
      const [stats, list, asideData, followed] = await Promise.all([
        profileStats(db, profile.user_id, own),
        loadProfileList(db, profile.user_id, own, tab, parseCursor(url.searchParams.get("before")), feedViewer(ctx, request)),
        loadDiscoverAside(db, ctx.viewer?.user_id ?? null),
        ctx.viewer ? followingAmong(db, ctx.viewer.user_id, [profile.user_id]) : Promise.resolve(new Set<string>()),
      ]);
      return { html: renderProfilePage(pctx, { profile, stats, tab, own, list, following: followed.has(profile.user_id) }, renderDiscoverAside(pctx, asideData)), status: 200 };
    });
  });
}

const SEARCH_MAX = 100;
const PEOPLE_LIMIT = 30;

/** Site search `/search?q=&type=posts|people` (site page: 451 in mainland China via src/proxy.ts). */
export async function searchResponse(request: Request): Promise<Response> {
  return guarded(request, async () => {
    const ctx = await pageContext(request, "site");
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
    const type: SearchType = url.searchParams.get("type") === "people" ? "people" : "posts";
    const db = getDb();
    const view: SearchView = { query, type, posts: null, people: null };
    if (query && type === "people") view.people = await searchProfiles(db, query, PEOPLE_LIMIT);
    if (query && type === "posts") view.posts = await loadFeed(db, { query }, parseCursor(url.searchParams.get("before")), feedViewer(ctx, request));
    return htmlResponse(renderSearchPage(ctx, view), 200);
  });
}
