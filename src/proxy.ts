import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/server/config/env";
import { REGION_BLOCK_HEADER } from "@/server/region/region-header";
import { countryFromHeaders, decideAccess, logRegionDecision } from "@/server/region/region-policy";

/**
 * Page-level mainland-China rule (plan §4): every page the matcher covers is a
 * "site" page. Blocked requests are only *marked* here; the path-only rewrite in
 * next.config.ts sends them to the 451 page. (A proxy rewrite needs an absolute
 * URL whose origin Next compares with its own; behind nginx they never match, so
 * Next would proxy the request over the network to itself.)
 */
export function proxy(request: NextRequest) {
  const decision = decideAccess({ country: countryFromHeaders(request.headers), access: "site", mode: getConfig().REGION_POLICY_CN });
  logRegionDecision(request.nextUrl.pathname, "site", decision);
  const headers = new Headers(request.headers);
  // Never trust an incoming marker; set it only on our own decision.
  headers.delete(REGION_BLOCK_HEADER);
  if (!decision.allowed) headers.set(REGION_BLOCK_HEADER, "1");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!api/|p/|auth/app-ticket|status/|_next/|media-local/|brand/|styles/|scripts/|fonts/|favicon\\.ico|robots\\.txt).*)",
  ],
};
