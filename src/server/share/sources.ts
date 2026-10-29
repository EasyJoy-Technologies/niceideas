import type { Locale } from "@/i18n/locales";
import type { Post } from "@/server/db/schema";
import { knownApp, knownSourceApp } from "./source-registry";
import { sourceAppName } from "./source-apps";

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
 * Shown only for apps turned on in the admin Apps page (source-registry.ts): our own apps by the source app
 * recorded at creation (§3.2 `sourceApp`; name as sent with the post), third-party apps (`api:<client_id>`)
 * with name, logo and website from the app directory. Web posts and posts of apps not turned on: none.
 */
export function sourceBadge(post: BadgeSource, locale: Locale): SourceBadge | null {
  if (post.source_app_key && post.source_app_names) {
    const app = knownSourceApp(post.source_app_key);
    if (!app?.show_badge) return null;
    return { name: sourceAppName(post.source_app_names, locale), icon: app.icon_url ?? EXTERNAL_ICON, href: app.website_url ? withUtm(app.website_url, "post_source") : null };
  }
  if (post.source.startsWith("api:")) {
    const app = knownApp(post.source.slice(4));
    if (app?.show_badge) return { name: app.name, icon: app.logo_url ?? EXTERNAL_ICON, href: app.website_url ? withUtm(app.website_url, "post_source") : null };
  }
  return null;
}
