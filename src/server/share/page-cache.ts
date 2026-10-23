import { SESSION_COOKIE } from "@/server/auth/web/session";
import { getConfig } from "@/server/config/env";
import { readCookie } from "@/server/http/cookies";
import { VISITOR_COOKIE } from "@/server/interactions/visitor";
import { ttlCache } from "@/server/util/ttl-cache";
import type { ChromeContext } from "./chrome";
import { htmlResponse } from "./respond";

export type RenderedPage = { html: string; status: number };

const cache = ttlCache<RenderedPage>(() => getConfig().PAGE_CACHE_SECONDS * 1000);

/**
 * Short per-process cache of public pages for anonymous visitors: no session and no
 * visitor cookie (those pages show the visitor's own likes). Keyed by language,
 * theme, region class and full URL, so every variant is cached separately.
 */
export async function cachedPage(request: Request, ctx: ChromeContext, render: () => Promise<RenderedPage>): Promise<Response> {
  const cookies = request.headers.get("cookie");
  const anonymous = !ctx.viewer && !readCookie(cookies, SESSION_COOKIE) && !readCookie(cookies, VISITOR_COOKIE);
  if (!anonymous || request.method !== "GET") {
    const page = await render();
    return htmlResponse(page.html, page.status);
  }
  const url = new URL(request.url);
  const page = await cache.get(`${ctx.intl.locale}|${ctx.theme}|${ctx.restricted ? 1 : 0}|${url.pathname}${url.search}`, render);
  return htmlResponse(page.html, page.status);
}

/** Test hook. */
export function clearPageCacheForTests(): void {
  cache.clear();
}
