import { randomUUID } from "node:crypto";
import { silentSignInTarget } from "@/server/auth/web/sign-in-flow";
import { getDb } from "@/server/db";
import { profileStats } from "@/server/db/repos/feed";
import { findProfileByHandle } from "@/server/db/repos/profiles";
import { searchProfiles } from "@/server/db/repos/search";
import { peekVisitorKey } from "@/server/interactions/visitor";
import { renderDiscoverPage } from "./discover-page";
import { feedTab, tabFilter } from "./feed-list";
import { loadFeed, parseCursor } from "./load-feed";
import { renderProfilePage } from "./profile-page";
import { renderSearchPage, type SearchType, type SearchView } from "./search-page";
import { htmlResponse, pageContext } from "./respond";
import { renderStatusPage } from "./status-page";

const HANDLE = /^[a-z0-9_]{3,30}$/;

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

/** Discover (also the signed-out home page). Site page: 451 in mainland China via src/proxy.ts. */
export async function discoverResponse(request: Request): Promise<Response> {
  return guarded(request, async () => {
    const ctx = await pageContext(request, "site");
    const url = new URL(request.url);
    const tab = feedTab(url);
    const page = await loadFeed(getDb(), tabFilter(tab), parseCursor(url.searchParams.get("before")), peekVisitorKey(request.headers));
    return htmlResponse(renderDiscoverPage(ctx, tab, page, "/discover"), 200);
  });
}

/** Public profile; `/@handle` is rewritten here by src/proxy.ts. */
export async function profileResponse(request: Request, rawHandle: string): Promise<Response> {
  return guarded(request, async () => {
    const handle = rawHandle.toLowerCase();
    const ctx = await pageContext(request, "site");
    const db = getDb();
    const profile = HANDLE.test(handle) ? await findProfileByHandle(db, handle) : undefined;
    if (!profile || profile.status !== "active") return htmlResponse(renderStatusPage({ ...ctx, path: `/@${handle}` }, "profileNotFound"), 404);
    const url = new URL(request.url);
    const tab = feedTab(url);
    const [stats, page] = await Promise.all([
      profileStats(db, profile.user_id),
      loadFeed(db, { ...tabFilter(tab), authorId: profile.user_id }, parseCursor(url.searchParams.get("before")), peekVisitorKey(request.headers)),
    ]);
    return htmlResponse(renderProfilePage({ ...ctx, path: `/@${handle}` }, { profile, stats, tab, page }), 200);
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
    if (query && type === "posts") view.posts = await loadFeed(db, { query }, parseCursor(url.searchParams.get("before")), peekVisitorKey(request.headers));
    return htmlResponse(renderSearchPage(ctx, view), 200);
  });
}
