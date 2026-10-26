import { ownMediaResponse } from "@/server/share/own-media-route";

export const dynamic = "force-dynamic";

/** Media of a private post, for its author only (src/server/share/own-media-route.ts). */
export async function GET(request: Request, ctx: RouteContext<"/p/[slug]/media/[...key]">) {
  const { slug, key } = await ctx.params;
  return ownMediaResponse(request, slug, key);
}
