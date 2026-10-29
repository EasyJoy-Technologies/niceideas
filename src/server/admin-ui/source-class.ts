import type { AdminPostSource } from "@/server/db/repos/admin-lists";
import { isSourceAppKey, SOURCE_APP_KEYS, type SourceAppKey } from "@/server/share/source-apps";
import { type BadgeSource, sourceBadge } from "@/server/share/sources";
import type { AdminContext } from "./shell";

/**
 * Where admin posts come from: one of our apps (by product group key), "other" (an app we do not know yet, or an
 * app share that named no app), the web, or third-party apps. Order = chart stacks and filter tabs.
 */
export type AdminSource = SourceAppKey | "other" | "web" | "api";
export const ADMIN_SOURCES: readonly AdminSource[] = [...SOURCE_APP_KEYS, "other", "web", "api"];

/** Name of a source class in the admin language. */
export function adminSourceLabel(ctx: AdminContext, s: AdminSource): string {
  return ctx.intl.t(isSourceAppKey(s) ? `common.brand.${s}` : `admin.source.${s}`);
}

/** Class of a raw `postsBySource` key: `web`, `api` or `app:<product group key, empty when none>`. */
export function adminSourceOfClass(raw: string): AdminSource {
  if (raw === "web" || raw === "api") return raw;
  const key = raw.startsWith("app:") ? raw.slice(4) : null;
  return isSourceAppKey(key) ? key : "other";
}

/** Posts list filter for a source class. */
export function adminPostSourceFilter(s: AdminSource): AdminPostSource {
  if (s === "web" || s === "api") return { kind: s };
  return s === "other" ? { kind: "otherApp", known: SOURCE_APP_KEYS } : { kind: "app", key: s };
}

/** Source column of one post: the name the post page shows, else its class name. */
export function postSourceLabel(ctx: AdminContext, post: BadgeSource): string {
  const badge = sourceBadge(post, ctx.intl.locale);
  if (badge) return badge.name;
  return adminSourceLabel(ctx, post.source === "web" ? "web" : post.source.startsWith("api:") ? "api" : "other");
}
