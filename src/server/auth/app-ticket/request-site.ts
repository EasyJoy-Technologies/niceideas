/** `Sec-Fetch-Site` of a request ("absent": not sent; "other": a value outside the standard four). */
export type FetchSite = "same-origin" | "same-site" | "cross-site" | "none" | "absent" | "other";
/** `Origin` of a request: not sent, the opaque "null", this site, or another site. */
export type OriginKind = "absent" | "null" | "self" | "other";

export type RequestSite = { fetchSite: FetchSite; origin: OriginKind; crossSite: boolean };

const FETCH_SITES: ReadonlySet<string> = new Set(["same-origin", "same-site", "cross-site", "none"]);

/**
 * Where a ticket exchange came from (contract §10.3). An app's WebView loading the exchange URL itself is
 * expected to send `Sec-Fetch-Site: none` (or nothing) and no `Origin` (or "null"). A submission from
 * another site — including sibling subdomains (`same-site`) — is refused, so no page can sign a
 * browser in as someone else (login CSRF). Unknown `Sec-Fetch-Site` values are refused as well.
 */
export function requestSite(headers: Headers, ownOrigin: string): RequestSite {
  const rawSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  const fetchSite: FetchSite = rawSite === undefined || rawSite === "" ? "absent" : FETCH_SITES.has(rawSite) ? (rawSite as FetchSite) : "other";
  const rawOrigin = headers.get("origin")?.trim();
  const origin: OriginKind = rawOrigin === undefined || rawOrigin === "" ? "absent" : rawOrigin === "null" ? "null" : rawOrigin === ownOrigin ? "self" : "other";
  const crossSite = fetchSite === "cross-site" || fetchSite === "same-site" || fetchSite === "other" || origin === "other";
  return { fetchSite, origin, crossSite };
}
