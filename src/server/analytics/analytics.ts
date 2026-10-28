import { getConfig } from "@/server/config/env";

/**
 * Optional usage analytics (Google Analytics 4, Microsoft Clarity). Nothing loads before the
 * visitor grants the analytics cookie category (src/server/consent): the page carries only the
 * ids, /scripts/consent.js asks and injects the vendor scripts after consent. Ids come from the
 * environment; empty = off.
 */
export type AnalyticsIds = { ga4: string; clarity: string };

/** Configured ids, or null when no analytics tool is configured (no banner, default CSP). */
export function analyticsIds(): AnalyticsIds | null {
  const { ANALYTICS_GA4_ID: ga4, ANALYTICS_CLARITY_ID: clarity } = getConfig();
  return ga4 || clarity ? { ga4, clarity } : null;
}

/** Directives that need extra sources (img-src already allows any https origin: avatars). */
export type CspDirective = "script-src" | "connect-src";

/**
 * Third-party origins the vendor scripts need, per CSP directive (Google: "Google Analytics
 * without Ads features"; Microsoft: Clarity CSP guide). Allowed only when the tool is configured;
 * the scripts themselves are injected only after consent.
 */
const ORIGINS: Record<keyof AnalyticsIds, Record<CspDirective, string[]>> = {
  ga4: {
    "script-src": ["https://www.googletagmanager.com"],
    "connect-src": ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.google.com"],
  },
  clarity: {
    "script-src": ["https://www.clarity.ms", "https://*.clarity.ms"],
    "connect-src": ["https://*.clarity.ms", "https://c.bing.com"],
  },
};

/** Extra CSP sources of `directive` for the configured tools (empty string when none). */
export function analyticsCspSources(directive: CspDirective): string {
  const ids = analyticsIds();
  if (!ids) return "";
  const tools = (Object.keys(ORIGINS) as (keyof AnalyticsIds)[]).filter((tool) => ids[tool]);
  const sources = new Set(tools.flatMap((tool) => ORIGINS[tool][directive]));
  return [...sources].map((s) => ` ${s}`).join("");
}
