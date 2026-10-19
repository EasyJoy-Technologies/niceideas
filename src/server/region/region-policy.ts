/**
 * region-policy — the ONLY place that decides mainland-China access (plan §4).
 * Pages, APIs and the proxy call `decideAccess`; nothing else inspects country headers.
 */

/** What a request is trying to reach. */
export type AccessClass =
  /** A specific post page `/p/<slug>` and the static assets it needs. */
  | "share"
  /** First-party publishing APIs (publish, sync, withdraw, media upload, sources). */
  | "publish_api"
  /** Third-party APIs (called server-to-server, e.g. OmniFire). */
  | "third_party_api"
  /** Health / version metadata. */
  | "public_meta"
  /** Any other page (home, discover, profiles, search, login, settings, web compose). */
  | "site"
  /** Any other API (timeline, follow, search, profile, …). */
  | "site_api";

export type RegionMode = "link_only" | "off";

export type RegionDecision = { allowed: true; restricted: boolean } | { allowed: false; restricted: true };

/** Mainland China only; Hong Kong (HK), Macau (MO) and Taiwan (TW) are separate codes and unaffected. */
const RESTRICTED_COUNTRY = "CN";

const ALLOWED_WHEN_RESTRICTED: ReadonlySet<AccessClass> = new Set(["share", "publish_api", "third_party_api", "public_meta"]);

/** Normalizes Cloudflare's `CF-IPCountry` (two letters; "XX"/"T1" etc. are not CN). */
export function countryFromHeaders(headers: Headers): string | null {
  const raw = headers.get("cf-ipcountry")?.trim().toUpperCase();
  return raw && /^[A-Z0-9]{2}$/.test(raw) ? raw : null;
}

export function decideAccess(input: { country: string | null; access: AccessClass; mode: RegionMode }): RegionDecision {
  const restricted = input.mode === "link_only" && input.country === RESTRICTED_COUNTRY;
  if (!restricted) return { allowed: true, restricted: false };
  return ALLOWED_WHEN_RESTRICTED.has(input.access) ? { allowed: true, restricted: true } : { allowed: false, restricted: true };
}

/** Structured access-log line for every restricted-region decision (misjudgement audits). */
export function logRegionDecision(path: string, access: AccessClass, decision: RegionDecision): void {
  if (!decision.restricted) return;
  console.info(JSON.stringify({ event: "region_policy", country: RESTRICTED_COUNTRY, access, path, allowed: decision.allowed }));
}
