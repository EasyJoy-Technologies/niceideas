import { randomUUID } from "node:crypto";
import { ADMIN_ACTIONS, findPostBySlug, runAdminAction, slugFromInput } from "@/server/admin/admin-actions";
import { isAdmin } from "@/server/admin/admins";
import { sessionProfile } from "@/server/auth/web/session";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { listOpenReportsForReview } from "@/server/db/repos/admin-queue";
import { isSameOrigin } from "@/server/interactions/visitor";
import { getMediaStores } from "@/server/storage";
import { renderAdminPage } from "./admin-page";
import { htmlResponse, pageContext } from "./respond";
import { renderStatusPage } from "./status-page";

const QUEUE_LIMIT = 100;
const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/** GET /admin: moderators only (others get the generic 404 page; signed-out → sign-in). */
export async function adminPage(request: Request): Promise<Response> {
  const ctx = await pageContext(request, "site");
  if (!ctx.viewer) return see("/auth/sign-in?next=%2Fadmin");
  if (!isAdmin(ctx.viewer)) return htmlResponse(renderStatusPage(ctx, "notFound"), 404);
  const url = new URL(request.url);
  const query = (url.searchParams.get("post") ?? "").trim().slice(0, 200);
  const slug = query ? slugFromInput(query) : null;
  const db = getDb();
  const [queue, lookup] = await Promise.all([listOpenReportsForReview(db, QUEUE_LIMIT), slug ? findPostBySlug(db, slug) : Promise.resolve(undefined)]);
  const n = url.searchParams.get("n");
  return htmlResponse(renderAdminPage(ctx, { queue, lookup: lookup ?? null, query, notice: n === "done" || n === "failed" ? n : null }), 200);
}

/** POST /admin (same-origin form): one audited moderation action with a reason. */
export async function adminAction(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  if (!isAdmin(viewer)) return new Response(null, { status: 404 });
  const form = await request.formData().catch(() => null);
  const action = String(form?.get("action") ?? "");
  const target = String(form?.get("target") ?? "");
  const back = action === "remove-post" || action === "restore-post" ? `/admin?post=${encodeURIComponent(target)}&` : "/admin?";
  if (!(ADMIN_ACTIONS as readonly string[]).includes(action)) return see(`${back}n=failed`);
  try {
    const cfg = getConfig();
    const rt = { db, stores: getMediaStores(), cacheControl: cfg.MEDIA_CACHE_CONTROL, retentionDays: cfg.POST_RETENTION_DAYS };
    const ok = await runAdminAction(rt, viewer!.user_id, { action, target, reason: String(form?.get("reason") ?? "") });
    console.info(JSON.stringify({ event: "admin_action", action, ok }));
    return see(`${back}n=${ok ? "done" : "failed"}`);
  } catch (err) {
    console.error(`[admin] action failed errorId=${randomUUID()}`, err);
    return see(`${back}n=failed`);
  }
}
