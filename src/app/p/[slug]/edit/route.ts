import { editPage } from "@/server/share/edit-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/p/[slug]/edit">) {
  return editPage(request, (await ctx.params).slug);
}
