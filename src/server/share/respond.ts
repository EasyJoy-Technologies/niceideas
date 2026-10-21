import { sessionProfile } from "@/server/auth/web/session";
import { webAuthSettings } from "@/server/auth/web/settings";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { countryFromHeaders, decideAccess, logRegionDecision, type AccessClass } from "@/server/region/region-policy";
import type { ChromeContext } from "./chrome";
import { pageIntl, requestLocale } from "./locale";

function signInOrigin(): string {
  const s = webAuthSettings();
  return s ? ` ${new URL(s.issuer).origin}` : "";
}

/**
 * Server-rendered pages carry no inline script or style: everything is same-origin,
 * except media (public bucket domain) and avatars (any https host).
 */
function contentSecurityPolicy(): string {
  const media = new URL(getConfig().MEDIA_PUBLIC_BASE_URL).origin;
  return [
    "default-src 'self'",
    `img-src 'self' ${media} https: data:`,
    `media-src 'self' ${media}`,
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    // Sign-out posts here and is redirected to the NiceMatrix sign-out page.
    `form-action 'self'${signInOrigin()}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Page context of a server-rendered page. Blocking of `site` pages in mainland China
 * happens in `src/proxy.ts`; here the decision only selects the restricted chrome.
 */
export async function pageContext(request: Request, access: AccessClass = "share"): Promise<ChromeContext> {
  const path = new URL(request.url).pathname;
  const decision = decideAccess({ country: countryFromHeaders(request.headers), access, mode: getConfig().REGION_POLICY_CN });
  logRegionDecision(path, access, decision);
  const viewer = decision.restricted ? null : await sessionProfile(getDb(), request.headers).catch(() => null);
  return { intl: await pageIntl(requestLocale(request)), restricted: decision.restricted, path, viewer };
}

/** HTML response; output varies by language and region, so shared caches must not store it. */
export function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
      Vary: "Accept-Language, Cookie, CF-IPCountry",
      "Content-Security-Policy": contentSecurityPolicy(),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
