import { randomUUID } from "node:crypto";
import { sessionProfile } from "@/server/auth/web/session";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { isSameOrigin } from "@/server/interactions/visitor";
import { loadPostForEdit, saveWebEdit } from "@/server/posts/edit-post";
import { SLUG_PATTERN } from "@/server/posts/slug";
import { readComposeForm } from "@/server/posts/web-compose";
import { countryFromHeaders, decideAccess } from "@/server/region/region-policy";
import { getMediaStores } from "@/server/storage";
import { COMPOSE_ERRORS, composeError } from "./compose-box";
import { composeErrorOf } from "./compose-route";
import { renderEditPage } from "./edit-page";
import { htmlResponse, pageContext } from "./respond";
import { renderStatusPage } from "./status-page";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/** GET /p/{slug}/edit: the author's edit page (others: 404; signed out: sign-in first). */
export async function editPage(request: Request, slug: string): Promise<Response> {
  const ctx = await pageContext(request, "site");
  const path = `/p/${slug}/edit`;
  // Under /p/ (outside the page proxy): editing is a site feature, closed in mainland China like posting.
  if (ctx.restricted) return htmlResponse(renderStatusPage(ctx, "restricted"), 451);
  if (!ctx.viewer) return see(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  if (!SLUG_PATTERN.test(slug)) return htmlResponse(renderStatusPage(ctx, "notFound"), 404);
  try {
    const { prefill, blocker } = await loadPostForEdit(getDb(), ctx.viewer.user_id, slug);
    const page = renderEditPage({ ...ctx, path }, slug, prefill ? { slug, prefill } : null, blocker, composeError(new URL(request.url)));
    return htmlResponse(page, blocker ? 409 : 200);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return htmlResponse(renderStatusPage(ctx, "notFound"), 404);
    throw err;
  }
}

/** POST /api/web/posts/edit (same-origin multipart form, works without JS): save, then the post page. */
export async function saveEditRoute(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const cfg = getConfig();
  if (!decideAccess({ country: countryFromHeaders(request.headers), access: "site_api", mode: cfg.REGION_POLICY_CN }).allowed) return new Response(null, { status: 451 });
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get("slug") ?? "");
  if (!SLUG_PATTERN.test(slug)) return see("/");
  if (!viewer) return see(`/auth/sign-in?next=${encodeURIComponent(`/p/${slug}/edit`)}`);
  // The post keeps its type (saveWebEdit applies it): a sent mode must not drop the title.
  form!.delete("mode");
  try {
    const post = await saveWebEdit(db, getMediaStores(), viewer.user_id, slug, readComposeForm(form!), cfg.MEDIA_CACHE_CONTROL);
    console.info(JSON.stringify({ event: "web_edit", ok: true }));
    return see(`/p/${post.slug}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return see("/");
    const code = err instanceof ApiError && err.code === "post.not_editable" ? "failed" : composeErrorOf(err);
    if (code === "failed") console.error(`[edit] save failed errorId=${randomUUID()}`, err);
    return see(`/p/${slug}/edit?compose=${COMPOSE_ERRORS.includes(code) ? code : "failed"}`);
  }
}
