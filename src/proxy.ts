import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/server/config/env";
import { countryFromHeaders, decideAccess, logRegionDecision } from "@/server/region/region-policy";

/** Internal target of blocked page requests. */
export const REGION_PAGE = "/status/region";

const PROFILE_PATH = /^\/@([A-Za-z0-9_]{1,40})\/?$/;

/**
 * Page-level mainland-China rule (plan §4): every page the matcher covers is a
 * "site" page; blocked visitors get the 451 page. Share pages (/p/…), APIs (own
 * check in `apiRoute`) and static assets are excluded by the matcher.
 */
export function proxy(request: NextRequest) {
  const decision = decideAccess({ country: countryFromHeaders(request.headers), access: "site", mode: getConfig().REGION_POLICY_CN });
  logRegionDecision(request.nextUrl.pathname, "site", decision);
  if (!decision.allowed) return NextResponse.rewrite(new URL(REGION_PAGE, request.url));
  // `/@handle` profiles live at /u/<handle> (an "@" folder would be a parallel route).
  const handle = PROFILE_PATH.exec(request.nextUrl.pathname)?.[1];
  if (handle) return NextResponse.rewrite(new URL(`/u/${handle.toLowerCase()}${request.nextUrl.search}`, request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|p/|status/|_next/|media-local/|brand/|styles/|scripts/|fonts/|favicon\\.ico|robots\\.txt).*)",
  ],
};
