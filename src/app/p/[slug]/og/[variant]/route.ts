import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { findMediaByIds } from "@/server/db/repos/media";
import { findPostBySlug } from "@/server/db/repos/posts";
import { findProfile } from "@/server/db/repos/profiles";
import { SLUG_PATTERN } from "@/server/posts/slug";
import { isOpenToAll } from "@/server/posts/visibility";
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
  // Public and link posts have a card (link posts: for chat previews, plan docs/plan/2026-11-23-link-visibility.md §4);
  // private, followers-only and friends-only ones look nonexistent here.
  if (post && !isOpenToAll(post.visibility)) return notFound();
  if (!post || post.status !== "active") return new Response(null, { status: post ? 410 : 404, headers: { "Cache-Control": "no-store" } });
  // Same rule as the page: nothing of an account being deleted is served.
  if ((await findProfile(db, post.author_id))?.status !== "active") return new Response(null, { status: 410, headers: { "Cache-Control": "no-store" } });
  if (!post.cover_media_id) return notFound();
  const [cover] = await findMediaByIds(db, [post.cover_media_id]);
  if (!cover || cover.kind !== "image") return notFound();
  // Public posts: only media projected to the public store. Link posts: the private store (the public one when also used by a public post).
  const listed = post.visibility === "public";
  if (listed && !cover.public_at) return notFound();
  const stores = getMediaStores();
  const body = await renderOgImage(cover.public_at ? stores.publicStore : stores.privateStore, cover, variant, `${cover.id}:${variant}`);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      // Public: same short TTL as public media, so a withdrawn post's card disappears quickly. Link posts: never in shared caches.
      "Cache-Control": listed ? getConfig().MEDIA_CACHE_CONTROL : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
