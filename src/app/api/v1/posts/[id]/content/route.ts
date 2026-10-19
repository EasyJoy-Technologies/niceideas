import { authenticateFirstParty } from "@/server/auth/authenticate";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { readJson } from "@/server/http/read-json";
import { toPostDto } from "@/server/posts/post-dto";
import { parseContentRequest } from "@/server/posts/requests";
import { postRuntime } from "@/server/posts/runtime";
import { syncPost } from "@/server/posts/sync-post";

/** Edit sync: new document + note update time. Same content → `changed: false`. */
export const PUT = apiRoute<RouteContext<"/api/v1/posts/[id]/content">>("posts.sync", async (request, ctx) => {
  const principal = await authenticateFirstParty(request);
  const input = parseContentRequest(await readJson(request));
  const { db, stores, cacheControl } = postRuntime();
  const result = await syncPost(db, stores, principal, { postId: (await ctx.params).id, ...input }, cacheControl);
  return jsonOk({ changed: result.changed, post: toPostDto(result.post, result.contentHash) });
});
