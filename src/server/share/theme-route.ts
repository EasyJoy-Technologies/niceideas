import { safeNextPath } from "./lang-route";
import { isTheme } from "./theme";
import { themeCookie } from "./theme-param";

/** GET /api/web/theme?t=auto|light|dark&next=<path>: remembers the theme (`ni_theme`) and returns to the page. */
export function themeRoute(request: Request): Response {
  const url = new URL(request.url);
  const theme = url.searchParams.get("t");
  const headers = new Headers({ Location: safeNextPath(url.searchParams.get("next")), "Cache-Control": "no-store" });
  if (isTheme(theme)) headers.append("Set-Cookie", themeCookie(theme));
  return new Response(null, { status: 303, headers });
}
