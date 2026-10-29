import type { AdminPostSource } from "@/server/db/repos/admin-lists";
import { sourceAppName } from "@/server/share/source-apps";
import { knownApp, knownSourceApp, sourceAppList } from "@/server/share/source-registry";
import type { BadgeSource } from "@/server/share/sources";
import type { AdminContext } from "./shell";

/**
 * Where admin posts come from: one of our apps (`app:<product group key>`, admin Apps page), "other" (an app
 * share that named no app), the web, or third-party apps. Order = chart stacks and filter tabs.
 */
export type AdminSource = `app:${string}` | "other" | "web" | "api";

/** Current classes: our registered apps in registration order, then other apps, web, third-party apps. */
export const adminSources = (): AdminSource[] => [...sourceAppList().map((a) => `app:${a.key}` as const), "other", "web", "api"];

const appKey = (s: string): string | null => (s.startsWith("app:") ? s.slice(4) : null);

/** Name of a source class in the admin language (our apps: their name as the backend last sent it). */
export function adminSourceLabel(ctx: AdminContext, s: AdminSource): string {
  const key = appKey(s);
  const app = key ? knownSourceApp(key) : undefined;
  if (key) return app ? sourceAppName(app.names, ctx.intl.locale) : key;
  return ctx.intl.t(`admin.source.${s}`);
}

/** Class of a raw `postsBySource` key: `web`, `api` or `app:<key>` (empty key / unregistered app → other). */
export function adminSourceOfClass(raw: string): AdminSource {
  if (raw === "web" || raw === "api") return raw;
  const key = appKey(raw);
  return key && knownSourceApp(key) ? `app:${key}` : "other";
}

/** `?src=` value when it is a current class. */
export const parseAdminSource = (v: string | null): AdminSource | null => (adminSources() as (string | null)[]).includes(v) ? (v as AdminSource) : null;

/** Posts list filter for a source class. */
export function adminPostSourceFilter(s: AdminSource): AdminPostSource {
  if (s === "web" || s === "api") return { kind: s };
  const key = appKey(s);
  return key ? { kind: "app", key } : { kind: "otherApp", known: sourceAppList().map((a) => a.key) };
}

/** Source column of one post: its app's name (shown or not on the site), else its class name. */
export function postSourceLabel(ctx: AdminContext, post: BadgeSource): string {
  if (post.source_app_names) return sourceAppName(post.source_app_names, ctx.intl.locale);
  if (post.source.startsWith("api:")) return knownApp(post.source.slice(4))?.name ?? ctx.intl.t("admin.source.api");
  return ctx.intl.t(post.source === "web" ? "admin.source.web" : "admin.source.other");
}
