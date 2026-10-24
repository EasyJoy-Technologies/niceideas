import { jsonOk } from "@/server/http/json";
import { toSourcePostDto } from "@/server/nicenote/dto";
import { pushShareContent } from "@/server/nicenote/push-content";
import { parseBody, pushContentBody } from "@/server/nicenote/requests";
import { sourceRoute } from "@/server/nicenote/source-route";
import { postRuntime } from "@/server/posts/runtime";

/** NiceMatrix backend: push the note's current content (sourceRevision orders pushes). */
export const PUT = sourceRoute<RouteContext<"/api/internal/v1/nicenote/posts/[id]/content">>("nicenote.push", async ({ db, json }, ctx) => {
  const input = parseBody(pushContentBody, json);
  const { stores, cacheControl } = postRuntime();
  const result = await pushShareContent(db, stores, cacheControl, (await ctx.params).id, input);
  console.info(JSON.stringify({ event: "nicenote_share", action: "push", postId: result.post.id, changed: result.changed, mediaState: result.post.media_state }));
  return jsonOk({ changed: result.changed, post: toSourcePostDto(result.post) });
});
