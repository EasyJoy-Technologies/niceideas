import { getDb } from "@/server/db";
import { listNotifications, markNotificationsSeen } from "@/server/db/repos/notifications";
import { renderNotificationsPage } from "./notifications-page";
import { htmlResponse, pageContext } from "./respond";

const LIMIT = 50;

/** GET /notifications (site page; 451 in mainland China via src/proxy.ts). Opening it marks everything seen. */
export async function notificationsPage(request: Request): Promise<Response> {
  const ctx = await pageContext(request, "site");
  if (!ctx.viewer) return new Response(null, { status: 303, headers: { Location: "/auth/sign-in?next=%2Fnotifications", "Cache-Control": "no-store" } });
  const db = getDb();
  const seenAt = ctx.viewer.notifications_seen_at;
  const items = await listNotifications(db, ctx.viewer.user_id, null, LIMIT);
  await markNotificationsSeen(db, ctx.viewer.user_id);
  return htmlResponse(renderNotificationsPage({ ...ctx, unread: 0 }, items, seenAt), 200);
}
