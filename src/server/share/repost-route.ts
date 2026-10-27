import { randomUUID } from "node:crypto";
import { sessionProfile } from "@/server/auth/web/session";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { jsonError, jsonOk } from "@/server/http/json";
import { setRepost } from "@/server/interactions/reposts";
import { assertVisitorMayWrite } from "@/server/interactions/guards";
import { isSameOrigin, visitorOf } from "@/server/interactions/visitor";
import { countryFromHeaders, decideAccess } from "@/server/region/region-policy";
import { safeNextPath } from "./lang-route";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/**
 * POST /api/web/posts/repost (same-origin form from a post's repost menu; fields slug, on = 1 / 0, back):
 * repost or undo, then back to the page. /scripts/interact.js sends the same form with
 * `Accept: application/json` and gets `{ reposted, repostCount }` instead (errors: `{ error }`).
 * Signed in only; not in mainland China (no in-site sharing there, like web compose).
 */
export async function repostFromWeb(request: Request): Promise<Response> {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  if (!isSameOrigin(request)) return wantsJson ? jsonError("request.cross_origin", 403) : new Response(null, { status: 403 });
  if (!decideAccess({ country: countryFromHeaders(request.headers), access: "site_api", mode: getConfig().REGION_POLICY_CN }).allowed) {
    return wantsJson ? jsonError("region.restricted", 451) : new Response(null, { status: 451 });
  }
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get("slug") ?? "");
  const on = form?.get("on") !== "0";
  const back = safeNextPath(String(form?.get("back") ?? "/"));
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  if (!viewer) return wantsJson ? jsonError("auth.required", 401) : see(`/auth/sign-in?next=${encodeURIComponent(back)}`);
  try {
    // Banned visitors / addresses take no actions (same rule as likes and comments).
    await assertVisitorMayWrite(db, request, visitorOf(request));
    const state = await setRepost(db, slug, viewer.user_id, on);
    return wantsJson ? jsonOk(state) : see(back);
  } catch (err) {
    if (err instanceof ApiError) return wantsJson ? jsonError(err.code, err.status) : see(back);
    console.error(`[repost] failed errorId=${randomUUID()}`, err);
    return wantsJson ? jsonError("server.internal", 500) : see(back);
  }
}
