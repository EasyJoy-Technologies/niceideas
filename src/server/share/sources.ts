import { getConfig } from "@/server/config/env";
import type { PostSource } from "@/server/db/schema";
import { knownApp } from "./source-registry";

/** Message key of each known source app's (localized) name. */
export type SourceAppKey = "brand.nicenote";

/**
 * `nameKey` for our own apps (translated); `name` for third-party apps, taken from the
 * NiceMatrix app directory (never hard-coded). `href` is null when the app has no website.
 */
export type SourceBadge = { nameKey?: SourceAppKey; name?: string; icon: string; href: string | null };

const EXTERNAL_ICON = "/brand/sources/third-party.svg";

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
 * third-party apps (`api:<client_id>`) get name, logo and website from the app directory cache (source-registry.ts).
 */
export function sourceBadge(source: PostSource): SourceBadge | null {
  if (source === "nicenote" || source === "nicenote_intl" || source === "nicenote_cn") {
    return { nameKey: "brand.nicenote", icon: "/brand/sources/nicenote.png", href: withUtm(getConfig().SOURCE_NICENOTE_URL, "post_source") };
  }
  if (source.startsWith("api:")) {
    const app = knownApp(source.slice(4));
    if (app) return { name: app.name, icon: app.logo_url ?? EXTERNAL_ICON, href: app.website_url ? withUtm(app.website_url, "post_source") : null };
  }
  return null;
}

/** Display name of the badge's app. */
export const badgeAppName = (t: (key: string) => string, b: SourceBadge) => b.name ?? t(`common.${b.nameKey}`);
