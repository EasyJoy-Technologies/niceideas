import { authenticateApi } from "@/server/auth/authenticate";
import { getDb } from "@/server/db";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { listCommentsForAuthor } from "@/server/interactions/author-comments";

/** Comments on the caller's own post (latest 200 visible). */
export const GET = apiRoute<RouteContext<"/api/v1/posts/[id]/comments">>("posts.comments.list", "publish_api", async (request, ctx) => {
  const principal = await authenticateApi(request, "posts:read");
  return jsonOk({ comments: await listCommentsForAuthor(getDb(), principal, (await ctx.params).id) });
});
