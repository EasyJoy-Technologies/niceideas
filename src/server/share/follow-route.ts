import { sessionProfile } from "@/server/auth/web/session";
import { safeNext } from "@/server/auth/web/settings";
import { getDb } from "@/server/db";
import { setFollow } from "@/server/db/repos/follows";
import { findProfileByHandle } from "@/server/db/repos/profiles";
import { isSameOrigin } from "@/server/interactions/visitor";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/**
 * POST /follow (same-origin form, no JS needed): `handle`, `on` = 1 | 0, `next`.
 * Signed-out visitors are sent to sign-in and come back to the page.
 */
export async function followRoute(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNext(String(form?.get("next") ?? "/"));
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  if (!viewer) return see(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  const target = await findProfileByHandle(db, String(form?.get("handle") ?? "").toLowerCase());
  if (target && target.status === "active") await setFollow(db, viewer.user_id, target.user_id, form?.get("on") === "1");
  return see(next);
}
