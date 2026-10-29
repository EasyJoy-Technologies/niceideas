import { randomUUID } from "node:crypto";
import { runAdminAction, ADMIN_ACTIONS, type BanOption } from "@/server/admin/admin-actions";
import { applyAppSettings, APP_SETTINGS_ACTION } from "@/server/admin/app-settings";
import { adminRoleOf, canConfigure, canModerate } from "@/server/admin/roles";
import { sessionProfile } from "@/server/auth/web/session";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { countOpenReportGroups } from "@/server/db/repos/admin-queue";
import { isSameOrigin } from "@/server/interactions/visitor";
import { safeNextPath } from "@/server/share/lang-route";
import { htmlResponse, pageContext } from "@/server/share/respond";
import { renderStatusPage } from "@/server/share/status-page";
import { getMediaStores } from "@/server/storage";
import { loadSection } from "./admin-load";
import { ADMIN_SECTIONS, type AdminContext, type AdminSection } from "./shell";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/** GET /admin[/section]: admin_member / ADMIN_USER_IDS only (others: generic 404; signed out: sign-in). */
export async function adminSectionPage(request: Request, section: string): Promise<Response> {
  const ctx = await pageContext(request, "site");
  const path = new URL(request.url).pathname;
  if (!ctx.viewer) return see(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  const db = getDb();
  const role = await adminRoleOf(db, ctx.viewer);
  if (!role || !(ADMIN_SECTIONS as readonly string[]).includes(section)) return htmlResponse(renderStatusPage(ctx, "notFound"), 404);
  const actx: AdminContext = { ...ctx, role, openReports: await countOpenReportGroups(db) };
  const html = await loadSection(db, actx, section as AdminSection, new URL(request.url));
  const res = htmlResponse(html, 200);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function banOption(form: FormData): BanOption {
  if (form.get("ban") !== "1") return null;
  const days = Number(form.get("days"));
  return { days: Number.isInteger(days) && days > 0 && days <= 365 ? days : null, byIp: form.get("ip") === "1" };
}

/** POST /admin (same-origin form): one audited action with a reason; back to the page it came from. */
export async function adminActionRoute(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  const role = await adminRoleOf(db, viewer);
  if (!role) return new Response(null, { status: 404 });
  const form = await request.formData().catch(() => null);
  const back = safeNextPath(String(form?.get("back") ?? "/admin"));
  const to = (n: "done" | "failed") => see(`${back.startsWith("/admin") ? back : "/admin"}${back.includes("?") ? "&" : "?"}n=${n}`);
  if (!form || !canModerate(role)) return to("failed");
  const action = String(form.get("action") ?? "");
  if (action === APP_SETTINGS_ACTION) {
    const ok = canConfigure(role) && (await applyAppSettings(db, viewer!.user_id, form).catch((err) => (console.error(`[admin] app settings failed errorId=${randomUUID()}`, err), false)));
    console.info(JSON.stringify({ event: "admin_action", action, ok }));
    return to(ok ? "done" : "failed");
  }
  if (!(ADMIN_ACTIONS as readonly string[]).includes(action)) return to("failed");
  try {
    const cfg = getConfig();
    const rt = { db, stores: getMediaStores(), cacheControl: cfg.MEDIA_CACHE_CONTROL, retentionDays: cfg.POST_RETENTION_DAYS };
    const ok = await runAdminAction(rt, viewer!.user_id, { action, target: String(form.get("target") ?? ""), reason: String(form.get("reason") ?? ""), ban: banOption(form) });
    console.info(JSON.stringify({ event: "admin_action", action, ok }));
    return to(ok ? "done" : "failed");
  } catch (err) {
    console.error(`[admin] action failed errorId=${randomUUID()}`, err);
    return to("failed");
  }
}
