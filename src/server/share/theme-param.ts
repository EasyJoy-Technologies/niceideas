import { serializeCookie } from "@/server/http/cookies";
import { isTheme, THEME_COOKIE } from "./theme";

/** Query parameter an app adds when it opens its user's own post, so the page matches the app's light / dark mode. */
export const THEME_PARAM = "theme";

const YEAR_SECONDS = 365 * 86_400;

/** `Set-Cookie` value remembering a theme choice (shared with the theme menu). */
export function themeCookie(theme: string): string {
  return serializeCookie(THEME_COOKIE, theme, { maxAge: YEAR_SECONDS });
}

/**
 * `?theme=light|dark|auto` on a page: remembers the theme like the theme menu does and 303-redirects to
 * the same URL without the parameter, so the first paint is right and copied / forwarded links stay clean.
 * Unknown values are just dropped. `null` when the parameter is absent.
 */
export function themeParamRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (!url.searchParams.has(THEME_PARAM)) return null;
  const theme = url.searchParams.get(THEME_PARAM);
  url.searchParams.delete(THEME_PARAM);
  const headers = new Headers({ Location: url.pathname + url.search, "Cache-Control": "no-store" });
  if (isTheme(theme)) headers.append("Set-Cookie", themeCookie(theme));
  return new Response(null, { status: 303, headers });
}
