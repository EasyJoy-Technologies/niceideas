import { randomUUID } from "node:crypto";
import { sessionProfile } from "@/server/auth/web/session";
import { getDb } from "@/server/db";
import { isSameOrigin } from "@/server/interactions/visitor";
import { updateOwnProfile } from "@/server/profiles/update-profile";
import { htmlResponse, pageContext } from "./respond";
import { renderSettingsPage, SETTINGS_ERRORS, type SettingsNotice } from "./settings-page";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/** GET /settings (site page; 451 in mainland China via src/proxy.ts). Signed-out → sign-in. */
export async function settingsPage(request: Request): Promise<Response> {
  const ctx = await pageContext(request, "site");
  if (!ctx.viewer) return see("/auth/sign-in?next=%2Fsettings");
  const n = new URL(request.url).searchParams.get("n") ?? "";
  const notice: SettingsNotice = n === "saved" ? "saved" : (SETTINGS_ERRORS as readonly string[]).includes(n) ? (n as SettingsNotice) : null;
  return htmlResponse(renderSettingsPage(ctx, notice), 200);
}

/** POST /settings (same-origin form). */
export async function saveSettings(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  if (!viewer) return see("/auth/sign-in?next=%2Fsettings");
  try {
    const form = await request.formData();
    const r = await updateOwnProfile(db, viewer, {
      displayName: String(form.get("displayName") ?? ""),
      bio: String(form.get("bio") ?? ""),
    });
    return see(`/settings?n=${r.ok ? "saved" : r.error}`);
  } catch (err) {
    console.error(`[settings] save failed errorId=${randomUUID()}`, err);
    return see("/settings?n=too_long");
  }
}
