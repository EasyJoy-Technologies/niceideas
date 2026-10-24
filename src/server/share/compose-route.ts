import { randomUUID } from "node:crypto";
import { sessionProfile } from "@/server/auth/web/session";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { isSameOrigin } from "@/server/interactions/visitor";
import { countryFromHeaders, decideAccess } from "@/server/region/region-policy";
import { BodyTooLargeError } from "@/server/util/temp-file";
import { publishFromWeb, readComposeForm } from "@/server/posts/web-compose";
import { getMediaStores } from "@/server/storage";
import { COMPOSE_ERRORS, type ComposeError } from "./compose-box";

const see = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

function errorOf(err: unknown): ComposeError {
  if (err instanceof BodyTooLargeError) return "too_large";
  if (!(err instanceof ApiError)) return "failed";
  const map: Record<string, ComposeError> = {
    "compose.empty": "empty", "compose.too_much": "too_much", "compose.images_only": "unsupported",
    "media.unsupported_type": "unsupported", "media.unprocessable": "unsupported", "media.too_large": "too_large",
    "rate.limited": "rate_limited", "document.invalid": "too_much",
    "compose.short_too_long": "short_too_long", "compose.media_mismatch": "unsupported", "compose.invalid": "failed",
    "document.too_long": "too_much", "document.too_many_images": "too_much", "document.too_many_audios": "too_much",
  };
  return map[err.code] ?? "failed";
}

/**
 * POST /api/web/compose (same-origin multipart form, works without JS). Success →
 * the new post page; failure → home with `?compose=<error>#compose` (reopens the phone sheet). Under /api so the
 * page proxy (body-size capped) is not in the upload path; region rule applied here.
 */
export async function composeRoute(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  if (!decideAccess({ country: countryFromHeaders(request.headers), access: "site_api", mode: getConfig().REGION_POLICY_CN }).allowed) return new Response(null, { status: 451 });
  const db = getDb();
  const viewer = await sessionProfile(db, request.headers);
  if (!viewer) return see("/auth/sign-in?next=%2F");
  try {
    const form = await request.formData();
    const cfg = getConfig();
    const post = await publishFromWeb(db, getMediaStores(), viewer.user_id, readComposeForm(form), cfg.MEDIA_CACHE_CONTROL);
    return see(`/p/${post.slug}`);
  } catch (err) {
    const code = errorOf(err);
    if (code === "failed") console.error(`[compose] failed errorId=${randomUUID()}`, err);
    return see(`/?compose=${COMPOSE_ERRORS.includes(code) ? code : "failed"}#compose`);
  }
}
