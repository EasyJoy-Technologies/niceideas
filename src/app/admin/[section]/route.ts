import { adminSectionPage } from "@/server/admin-ui/admin-routes";

export const dynamic = "force-dynamic";

/** Admin console sections: /admin/posts, /admin/comments, /admin/reports, /admin/bans, /admin/audit. */
export async function GET(request: Request, ctx: { params: Promise<{ section: string }> }) {
  return adminSectionPage(request, (await ctx.params).section);
}
