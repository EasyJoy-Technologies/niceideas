import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { getConfig } from "@/server/config/env";
import { countryFromHeaders, decideAccess, logRegionDecision, type AccessClass } from "@/server/region/region-policy";
import { ApiError } from "./errors";
import { jsonError } from "./json";

export type ApiHandler<C> = (request: Request, context: C) => Promise<Response | NextResponse>;

/**
 * Wraps a route handler: applies the region policy for the route's access
 * class (plan §4), maps ApiError to its JSON error body and any other failure
 * to a logged 500 without leaking internals.
 */
export function apiRoute<C>(name: string, access: AccessClass, handler: ApiHandler<C>): ApiHandler<C> {
  return async (request, context) => {
    const decision = decideAccess({ country: countryFromHeaders(request.headers), access, mode: getConfig().REGION_POLICY_CN });
    logRegionDecision(new URL(request.url).pathname, access, decision);
    if (!decision.allowed) return jsonError("region.restricted", 451);
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.code, err.status, err.details, err.headers);
      const errorId = randomUUID();
      console.error(`[api] ${name} failed errorId=${errorId}`, err);
      return jsonError("server.internal", 500, { errorId });
    }
  };
}
