import { analyticsIds } from "@/server/analytics/analytics";

/**
 * Optional cookie categories the visitor decides on (cookie banner, src/server/share/consent.ts;
 * browser side src/client/consent). "Necessary" cookies are always on and never stored. A category
 * is offered only while at least one of its vendors is configured, so the banner never asks about
 * something the site does not do (advertising: no vendor yet).
 */
export const CONSENT_CATEGORIES = ["analytics", "ads"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/**
 * Version of the consent request. Bump it when the purposes or vendors of a category change
 * materially: every visitor is asked again. A newly offered category is asked about automatically.
 */
export const CONSENT_VERSION = 1;

/** Categories with at least one configured vendor, in banner order. */
export function offeredCategories(): ConsentCategory[] {
  const offered: ConsentCategory[] = [];
  if (analyticsIds()) offered.push("analytics");
  return offered;
}
