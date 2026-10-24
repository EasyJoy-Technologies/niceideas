import { randomUUID } from "node:crypto";
import { sessionProfile } from "@/server/auth/web/session";
import { getDb } from "@/server/db";
import { isSameOrigin } from "@/server/interactions/visitor";
import { deleteOwnPost } from "@/server/posts/delete-own-post";
import { postRuntime } from "@/server/posts/runtime";
import { safeNextPath } from "./lang-route";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
const failed = (back: string) => see(`${back}${back.includes("?") ? "&" : "?"}n=delete_failed`);

/** POST /api/web/posts/delete (same-origin form from the author's "⋯" menu): delete, then back to the page. */
export async function deletePostFromWeb(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get("slug") ?? "");
  const back = safeNextPath(String(form?.get("back") ?? "/"));
  const { db, stores, retentionDays } = { ...postRuntime(), db: getDb() };
  const viewer = await sessionProfile(db, request.headers);
  if (!viewer) return see(`/auth/sign-in?next=${encodeURIComponent(back)}`);
  try {
    const post = await deleteOwnPost(db, stores, viewer.user_id, slug, retentionDays);
    console.info(JSON.stringify({ event: "web_delete", ok: !!post }));
    return post ? see(back) : failed(back);
  } catch (err) {
    console.error(`[delete] web delete failed errorId=${randomUUID()}`, err);
    return failed(back);
  }
}
