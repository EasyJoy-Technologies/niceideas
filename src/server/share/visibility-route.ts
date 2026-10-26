import { randomUUID } from "node:crypto";
import { sessionProfile } from "@/server/auth/web/session";
import { isSameOrigin } from "@/server/interactions/visitor";
import { postRuntime } from "@/server/posts/runtime";
import { setOwnPostVisibility } from "@/server/posts/set-own-visibility";
import { isVisibility } from "@/server/posts/visibility";
import { safeNextPath } from "./lang-route";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
const failed = (back: string) => see(`${back}${back.includes("?") ? "&" : "?"}n=visibility_failed`);

/** POST /api/web/posts/visibility (same-origin form from the author's "⋯" menu): make private / public, then back to the page. */
export async function setVisibilityFromWeb(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get("slug") ?? "");
  const visibility = form?.get("visibility");
  const back = safeNextPath(String(form?.get("back") ?? "/"));
  const rt = postRuntime();
  const viewer = await sessionProfile(rt.db, request.headers);
  if (!viewer) return see(`/auth/sign-in?next=${encodeURIComponent(back)}`);
  if (!isVisibility(visibility)) return failed(back);
  try {
    const post = await setOwnPostVisibility(rt, viewer.user_id, slug, visibility);
    console.info(JSON.stringify({ event: "web_visibility", ok: !!post, visibility }));
    return post ? see(back) : failed(back);
  } catch (err) {
    console.error(`[visibility] web change failed errorId=${randomUUID()}`, err);
    return failed(back);
  }
}
