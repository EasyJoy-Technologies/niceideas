import { getConfig } from "@/server/config/env";
import type { PostSource } from "@/server/db/schema";
import { registeredApp } from "./source-registry";

/** Message key of each known source app's (localized) name. */
export type SourceAppKey = "brand.nicenote";

/** `nameKey` for our own apps (translated); `name` for registered third-party apps (brand names are not translated). */
export type SourceBadge = { nameKey?: SourceAppKey; name?: string; icon: string; href: string };

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
 * third-party apps (`api:*`) get theirs from the API-client registry (source-registry.ts).
 */
export function sourceBadge(source: PostSource): SourceBadge | null {
  if (source === "nicenote_intl" || source === "nicenote_cn") {
    return { nameKey: "brand.nicenote", icon: "/brand/sources/nicenote.png", href: withUtm(getConfig().SOURCE_NICENOTE_URL, "post_source") };
  }
  if (source.startsWith("api:")) {
    const app = registeredApp(source.slice(4));
    if (app) return { name: app.name, icon: app.icon_url ?? EXTERNAL_ICON, href: withUtm(app.homepage_url, "post_source") };
  }
  return null;
}

/** Display name of the badge's app. */
export const badgeAppName = (t: (key: string) => string, b: SourceBadge) => b.name ?? t(`common.${b.nameKey}`);
