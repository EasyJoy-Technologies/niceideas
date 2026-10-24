import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import type { Db } from "@/server/db/client";
import { apiRoute } from "@/server/http/api-route";
import { parseJsonBytes, readRawBody } from "@/server/http/read-json";
import { verifyServiceRequest } from "@/server/service-auth/verify";

/** Request body cap of the source API (contract §3). */
export const SOURCE_MAX_BODY_BYTES = 8 * 1024 * 1024;

export type SourceRequest = { db: Db; json: unknown };

/** Accepted keys (current + rotation) and caller ids of the NiceMatrix backend. */
function trust() {
  const cfg = getConfig();
  return {
    keys: [cfg.NICEMATRIX_SHARE_KEY, cfg.NICEMATRIX_SHARE_KEY_NEXT].filter((k): k is string => !!k),
    services: cfg.NICEMATRIX_SHARE_SERVICES.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/**
 * Route wrapper of /api/internal/v1/nicenote/** (server to server, never region-restricted):
 * reads the body (≤ 8 MB), verifies the X-NM-* signature over method, path + query and the raw
 * body, then hands over the parsed JSON. Errors use the API error format.
 */
export function sourceRoute<C>(name: string, handler: (req: SourceRequest, context: C) => Promise<Response>) {
  return apiRoute<C>(name, "third_party_api", async (request, context) => {
    const body = await readRawBody(request, SOURCE_MAX_BODY_BYTES);
    const url = new URL(request.url);
    const db = getDb();
    await verifyServiceRequest(db, { method: request.method, pathWithQuery: url.pathname + url.search, headers: request.headers, body }, trust());
    return handler({ db, json: body.length ? parseJsonBytes(body) : undefined }, context);
  });
}
