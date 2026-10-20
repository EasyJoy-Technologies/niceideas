import { profileResponse } from "@/server/share/feed-routes";

/** Public profile page (served at `/@handle` through the rewrite in src/proxy.ts). */
export async function GET(request: Request, ctx: RouteContext<"/u/[handle]">) {
  return profileResponse(request, (await ctx.params).handle);
}
