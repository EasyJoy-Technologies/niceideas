import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { loadSharePost } from "@/server/share/load-post";
import { renderPostPage } from "@/server/share/post-page";
import { htmlResponse, shareContext } from "@/server/share/respond";
import { renderStatusPage } from "@/server/share/status-page";

/** Public post page (plan §6, §16): 200 / 404 / 410, plain server HTML. */
export async function GET(request: Request, ctx: RouteContext<"/p/[slug]">) {
  const page = await shareContext(request);
  try {
    const result = await loadSharePost(getDb(), (await ctx.params).slug);
    if (result.state === "not_found") return htmlResponse(renderStatusPage(page, "notFound"), 404);
    if (result.state === "gone") return htmlResponse(renderStatusPage(page, result.reason), 410);
    return htmlResponse(renderPostPage(page, result.data), 200);
  } catch (err) {
    console.error(`[share] page failed errorId=${randomUUID()}`, err);
    throw err;
  }
}
