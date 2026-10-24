import { serviceHeaders } from "@/server/service-auth/signature";
import { BodyTooLargeError, removeTempDir, spoolBody, type SpooledBody } from "@/server/util/temp-file";
import { NICEIDEAS_SERVICE } from "./backend-client";
import { isAllowedGrantUrl } from "./share-media";

/** Why a grant could not be fetched: `fetch_expired` / `fetch_failed` are temporary (contract §4.2), `too_large` permanent. */
export class GrantFetchError extends Error {
  constructor(
    readonly reason: "fetch_failed" | "fetch_expired" | "too_large",
    detail: string,
  ) {
    super(detail);
  }
}

/** A whole file may take a while on a slow link; the job lease is renewed meanwhile. */
const FETCH_TIMEOUT_MS = 30 * 60_000;

/**
 * Downloads a media grant (contract §4.3): signed GET, only under the configured backend's grant
 * path, no redirects, streamed to a private temp file with a byte limit and sha256.
 */
export async function fetchGrant(url: string, opts: { key: string; maxBytes: number; signal?: AbortSignal }): Promise<SpooledBody> {
  if (!isAllowedGrantUrl(url)) throw new GrantFetchError("fetch_failed", "grant url not allowed");
  const u = new URL(url);
  const signal = AbortSignal.any([AbortSignal.timeout(FETCH_TIMEOUT_MS), ...(opts.signal ? [opts.signal] : [])]);
  let res: Response;
  try {
    res = await fetch(u, { headers: serviceHeaders(opts.key, NICEIDEAS_SERVICE, "GET", u.pathname + u.search), redirect: "error", signal });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new GrantFetchError("fetch_failed", err instanceof Error ? err.message : "network error");
  }
  if (res.status === 410) {
    await res.body?.cancel();
    throw new GrantFetchError("fetch_expired", "410");
  }
  if (res.status !== 200 || !res.body) {
    await res.body?.cancel();
    throw new GrantFetchError("fetch_failed", `HTTP ${res.status}`);
  }
  const declared = Number(res.headers.get("content-length") ?? NaN);
  if (declared > opts.maxBytes) {
    await res.body.cancel();
    throw new GrantFetchError("too_large", `${declared} bytes`);
  }
  let file: SpooledBody;
  try {
    file = await spoolBody(res.body, opts.maxBytes);
  } catch (err) {
    if (err instanceof BodyTooLargeError) throw new GrantFetchError("too_large", "over the size limit");
    if (opts.signal?.aborted) throw err;
    throw new GrantFetchError("fetch_failed", err instanceof Error ? err.message : "interrupted");
  }
  if (Number.isFinite(declared) && declared !== file.bytes) {
    await removeTempDir(file.dir);
    throw new GrantFetchError("fetch_failed", `truncated (${file.bytes}/${declared})`);
  }
  return file;
}
