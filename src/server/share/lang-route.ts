import { isLocale, LOCALE_COOKIE } from "@/i18n/locales";
import { serializeCookie } from "@/server/http/cookies";
import { LANG_PARAM } from "./locale";

const YEAR_SECONDS = 365 * 86_400;

/** Same-site path only (no scheme, no `//host`, no backslash tricks); otherwise home. */
export function safeNextPath(value: string | null): string {
  return value && /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : "/";
}

/**
 * GET /api/web/lang?hl=<locale>&next=<path>: the language menu's choice. Remembers it
 * in the `ni_locale` cookie (so every later page keeps it) and returns to the page.
 * `?hl=` on a page URL still renders that page alone in a language without a cookie.
 */
export function langRoute(request: Request): Response {
  const url = new URL(request.url);
  const hl = url.searchParams.get(LANG_PARAM);
  const headers = new Headers({ Location: safeNextPath(url.searchParams.get("next")), "Cache-Control": "no-store" });
  if (isLocale(hl)) headers.append("Set-Cookie", serializeCookie(LOCALE_COOKIE, hl, { maxAge: YEAR_SECONDS }));
  return new Response(null, { status: 303, headers });
}
