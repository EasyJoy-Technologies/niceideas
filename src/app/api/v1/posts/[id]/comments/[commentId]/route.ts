import { authenticateFirstParty } from "@/server/auth/authenticate";
import { getDb } from "@/server/db";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { deleteCommentAsAuthor } from "@/server/interactions/author-comments";

/** The post's author deletes a comment under it. Idempotent. */
export const DELETE = apiRoute<RouteContext<"/api/v1/posts/[id]/comments/[commentId]">>("posts.comments.delete", "publish_api", async (request, ctx) => {
  const principal = await authenticateFirstParty(request);
  const { id, commentId } = await ctx.params;
  await deleteCommentAsAuthor(getDb(), principal, id, commentId);
  return jsonOk({ deleted: true });
});
