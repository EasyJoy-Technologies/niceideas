import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { findMediaByIds } from "@/server/db/repos/media";
import { findPostBySlug } from "@/server/db/repos/posts";
import { findProfile } from "@/server/db/repos/profiles";
import { SLUG_PATTERN } from "@/server/posts/slug";
import { countryFromHeaders, decideAccess, logRegionDecision } from "@/server/region/region-policy";
import { OG_VARIANTS, renderOgImage, type OgVariant } from "@/server/share/og-image";
import { getMediaStores } from "@/server/storage";

const isVariant = (v: string): v is OgVariant => Object.hasOwn(OG_VARIANTS, v);
const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Share-card image cropped from the post cover (plan §16.3). Open to every crawler, including mainland China. */
export async function GET(request: Request, ctx: RouteContext<"/p/[slug]/og/[variant]">) {
  const { slug, variant } = await ctx.params;
  const decision = decideAccess({ country: countryFromHeaders(request.headers), access: "share", mode: getConfig().REGION_POLICY_CN });
  logRegionDecision(new URL(request.url).pathname, "share", decision);
  if (!isVariant(variant) || !SLUG_PATTERN.test(slug)) return notFound();

  const db = getDb();
  const post = await findPostBySlug(db, slug);
  if (!post || post.status !== "active") return new Response(null, { status: post ? 410 : 404, headers: { "Cache-Control": "no-store" } });
  // Same rule as the page: nothing of an account being deleted is served.
  if ((await findProfile(db, post.author_id))?.status !== "active") return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } });
  if (!post.cover_media_id) return notFound();
  const [cover] = await findMediaByIds(db, [post.cover_media_id]);
  // Only media projected to the public store may be served.
  if (!cover || cover.kind !== "image" || !cover.public_at) return notFound();

  const body = await renderOgImage(getMediaStores().publicStore, cover, variant, `${cover.id}:${variant}`);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      // Same short TTL as public media: a withdrawn post's card disappears quickly.
      "Cache-Control": getConfig().MEDIA_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
