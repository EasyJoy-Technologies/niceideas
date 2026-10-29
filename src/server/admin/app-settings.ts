import { z } from "zod";
import type { Db } from "@/server/db/client";
import { recordModeration } from "@/server/db/repos/moderation";
import { setApiClientBadge, updateSourceApp } from "@/server/db/repos/source-apps";
import { resetSourceRegistry } from "@/server/share/source-registry";

/** Admin Apps page form action (admins only): show / hide "From <app>", and our apps' website and icon. */
export const APP_SETTINGS_ACTION = "app-settings";

const HTTPS = /^https:\/\/[^\s"'<>\\]{1,492}$/;
const SITE_ICON = /^\/brand\/sources\/[a-z0-9-]{1,40}\.(png|svg|webp)$/;
const https = (v: string) => HTTPS.test(v) && URL.canParse(v);
/** Empty → null; otherwise must pass `ok`. */
const optional = (ok: (v: string) => boolean) => z.string().trim().transform((v) => v || null).refine((v) => v === null || ok(v));
const ownApp = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  show: z.boolean(),
  website: optional(https),
  icon: optional((v) => https(v) || SITE_ICON.test(v)),
});

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

/**
 * Applies one change from the Apps page. `target`: `app:<product group key>` (badge, website, icon) or
 * `api:<client_id>` (badge only; name, logo and website come from the app directory). Audited as
 * `app_settings`; the badge registry reloads at once in this process (others within a minute).
 */
export async function applyAppSettings(db: Db, actorId: string, form: FormData): Promise<boolean> {
  const target = field(form, "target");
  const show = field(form, "show") === "1";
  let ok = false;
  let detail: Record<string, unknown>;
  if (target.startsWith("app:")) {
    const p = ownApp.safeParse({ key: target.slice(4), show, website: field(form, "website"), icon: field(form, "icon") });
    if (!p.success) return false;
    ok = await updateSourceApp(db, p.data.key, { showBadge: p.data.show, websiteUrl: p.data.website, iconUrl: p.data.icon });
    detail = { app: target, show, website: p.data.website, icon: p.data.icon };
  } else if (target.startsWith("api:") && target.length > 4 && target.length <= 204) {
    ok = await setApiClientBadge(db, target.slice(4), show);
    detail = { app: target, show };
  } else return false;
  if (!ok) return false;
  await recordModeration(db, { action: "app_settings", actorId, reason: "", detail: JSON.stringify(detail) });
  resetSourceRegistry();
  return true;
}

/** App and badge state of an `app_settings` audit row (null when unreadable). */
export function appSettingsDetail(detail: string): { app: string; show: boolean } | null {
  try {
    const d = JSON.parse(detail) as { app?: unknown; show?: unknown };
    return typeof d.app === "string" && typeof d.show === "boolean" ? { app: d.app, show: d.show } : null;
  } catch {
    return null;
  }
}
