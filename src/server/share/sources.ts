import { getConfig } from "@/server/config/env";
import type { PostSource } from "@/server/db/schema";

/** Message key of each known source app's (localized) name. */
export type SourceAppKey = "brand.nicenote";

export type SourceBadge = { nameKey: SourceAppKey; icon: string; href: string };

/** Adds attribution parameters without disturbing an existing query string. */
export function withUtm(url: string, medium: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "niceideas");
  u.searchParams.set("utm_medium", medium);
  return u.toString();
}

/**
 * "From <app>" badge of a post (plan §16.4). Decided server-side from the
 * stored `source`, never from client input. Web posts carry no badge;
 * third-party apps (`api:*`) get theirs from the API-client registry in phase 3.
 */
export function sourceBadge(source: PostSource): SourceBadge | null {
  if (source === "nicenote_intl" || source === "nicenote_cn") {
    return { nameKey: "brand.nicenote", icon: "/brand/sources/nicenote.png", href: withUtm(getConfig().SOURCE_NICENOTE_URL, "post_source") };
  }
  return null;
}

/** Store / landing page of NiceNote (footer "Get NiceNote"). */
export function nicenoteHome(medium: string): string {
  return withUtm(getConfig().SOURCE_NICENOTE_URL, medium);
}
