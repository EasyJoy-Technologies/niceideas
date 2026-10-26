import { randomUUID } from "node:crypto";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { clearCookie, readCookie, serializeCookie } from "@/server/http/cookies";
import { ApiError } from "@/server/http/errors";
import { isSameOrigin } from "@/server/interactions/visitor";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { syncProfileFromClaims } from "@/server/profiles/sync-from-claims";
import { FLOW_COOKIE, FLOW_MAX_AGE, newFlow, openFlow, pkceChallenge, sealFlow, SILENT_STATE_PREFIX } from "./flow-cookie";
import { oidcProvider } from "./oidc-provider";
import { endSession, SESSION_COOKIE, startSession } from "./session";
import { safeNext, webAuthSettings } from "./settings";

/** Set after a silent (prompt=none) attempt so a signed-out visitor is not bounced again for a day. */
export const SSO_TRIED_COOKIE = "ni_sso";
const SSO_TRIED_MAX_AGE = 86_400;
/** Errors of a silent attempt that just mean "not signed in at NiceMatrix". */
/** Marker on the fallback redirect when cookies are blocked (stops silent retries). */
const SSO_OFF_PARAM = "sso";
const BOT = /bot|crawl|spider|slurp|preview|facebookthird-partyhit|embedly|whatsapp|telegram|wechat|curl|wget|python|headless/i;
const SILENT_MISSES = new Set(["login_required", "consent_required", "interaction_required", "account_selection_required"]);

export type SignInFailure = "disabled" | "expired" | "failed" | "deleting";

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

/** GET /auth/sign-in?next=/path[&silent=1]: redirect to NiceMatrix sign-in (Logto). */
export async function startSignIn(request: Request): Promise<Response | SignInFailure> {
  const s = webAuthSettings();
  if (!s) return "disabled";
  const url = new URL(request.url);
  const flow = newFlow(safeNext(url.searchParams.get("next")), url.searchParams.get("silent") === "1");
  const target = await oidcProvider(s).authorizeUrl({ state: flow.state, nonce: flow.nonce, challenge: pkceChallenge(flow.verifier), silent: flow.silent });
  return redirect(target, [serializeCookie(FLOW_COOKIE, sealFlow(s.clientSecret, flow), { maxAge: FLOW_MAX_AGE })]);
}

/** GET /auth/callback: code → verified ID token → profile → session cookie. */
export async function finishSignIn(request: Request): Promise<Response | SignInFailure> {
  const s = webAuthSettings();
  if (!s) return "disabled";
  const url = new URL(request.url);
  const flow = openFlow(s.clientSecret, readCookie(request.headers.get("cookie"), FLOW_COOKIE));
  const state = url.searchParams.get("state") ?? "";
  if (!flow || flow.state !== state) {
    // A silent attempt whose cookie was lost (cookies blocked): back home, no further silent tries.
    if (state.startsWith(SILENT_STATE_PREFIX)) return redirect(`/?${SSO_OFF_PARAM}=1`);
    return "expired";
  }
  const clearFlow = clearCookie(FLOW_COOKIE);
  const error = url.searchParams.get("error");
  if (error) {
    if (flow.silent && SILENT_MISSES.has(error)) {
      return redirect(flow.next, [clearFlow, serializeCookie(SSO_TRIED_COOKIE, "1", { maxAge: SSO_TRIED_MAX_AGE })]);
    }
    console.warn(JSON.stringify({ event: "web_sign_in", result: "provider_error", error: error.slice(0, 64) }));
    return "failed";
  }
  const code = url.searchParams.get("code");
  if (!code) return "failed";
  try {
    const claims = await oidcProvider(s).redeem(code, flow.verifier, flow.nonce);
    if (typeof claims.sub !== "string" || !claims.sub) return "failed";
    const db = getDb();
    const profile = await ensureProfile(db, claims.sub);
    if (profile.status !== "active") return "deleting";
    await syncProfileFromClaims(db, profile, claims);
    const session = await startSession(db, profile.user_id);
    console.info(JSON.stringify({ event: "web_sign_in", result: "ok", silent: flow.silent }));
    return redirect(flow.next, [clearFlow, session, clearCookie(SSO_TRIED_COOKIE)]);
  } catch (err) {
    // The account's deletion completed: same answer as during the cooling-off period.
    if (err instanceof ApiError && err.code === "user.deleting") return "deleting";
    console.error(`[auth] sign-in failed errorId=${randomUUID()}`, err);
    return "failed";
  }
}

/**
 * POST /auth/sign-out (same-origin form): ends the NiceIdeas session, then the
 * NiceMatrix one (otherwise silent sign-in would sign the user straight back in).
 */
export async function signOut(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const cleared = await endSession(getDb(), request.headers);
  const s = webAuthSettings();
  const target = s ? await oidcProvider(s).endSessionUrl().catch(() => "/") : "/";
  return redirect(target, [cleared, serializeCookie(SSO_TRIED_COOKIE, "1", { maxAge: SSO_TRIED_MAX_AGE })]);
}

/**
 * Silent sign-in (SSO with other NiceMatrix sites, prompt=none): target for the
 * first site-page visit of a signed-out browser, at most once a day; null otherwise.
 * Not used on share pages (link opens stay one hop) or for bots.
 */
export function silentSignInTarget(request: Request): string | null {
  if (request.method !== "GET" || !webAuthSettings() || getConfig().WEB_SILENT_SSO !== "on") return null;
  const cookies = request.headers.get("cookie");
  if (readCookie(cookies, SESSION_COOKIE) || readCookie(cookies, SSO_TRIED_COOKIE)) return null;
  if (BOT.test(request.headers.get("user-agent") ?? "") || !(request.headers.get("accept") ?? "").includes("text/html")) return null;
  const url = new URL(request.url);
  if (url.searchParams.has(SSO_OFF_PARAM)) return null;
  return `/auth/sign-in?silent=1&next=${encodeURIComponent(safeNext(url.pathname + url.search))}`;
}
