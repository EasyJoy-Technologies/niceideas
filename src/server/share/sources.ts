import type { Locale } from "@/i18n/locales";
import type { Post } from "@/server/db/schema";
import { knownApp } from "./source-registry";
import { isSourceAppKey, SOURCE_APPS, sourceAppName } from "./source-apps";

/** "From <app>" badge: app name in the page language, logo, and website (null when the app has none). */
export type SourceBadge = { name: string; icon: string; href: string | null };

const EXTERNAL_ICON = "/brand/sources/third-party.svg";

/** Adds attribution parameters without disturbing an existing query string. */
export function withUtm(url: string, medium: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "niceideas");
  u.searchParams.set("utm_medium", medium);
  return u.toString();
}

export type BadgeSource = Pick<Post, "source" | "source_app_key" | "source_app_names">;

/**
 * "From <app>" badge of a post (plan §16.4), decided server-side from stored data, never from client input.
 * App shares: the source app recorded at creation (§3.2 `sourceApp`; none recorded → no badge); an app we do not
 * know yet gets the generic logo and no link. Third-party apps (`api:<client_id>`): name, logo and website from
 * the app directory cache (source-registry.ts). Web posts carry no badge.
 */
export function sourceBadge(post: BadgeSource, locale: Locale): SourceBadge | null {
  if (post.source_app_key && post.source_app_names) {
    const name = sourceAppName(post.source_app_names, locale);
    if (!isSourceAppKey(post.source_app_key)) return { name, icon: EXTERNAL_ICON, href: null };
    const app = SOURCE_APPS[post.source_app_key];
    return { name, icon: app.icon, href: withUtm(app.website(), "post_source") };
  }
  if (post.source.startsWith("api:")) {
    const app = knownApp(post.source.slice(4));
    if (app) return { name: app.name, icon: app.logo_url ?? EXTERNAL_ICON, href: app.website_url ? withUtm(app.website_url, "post_source") : null };
  }
  return null;
}
