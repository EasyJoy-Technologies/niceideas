import { findComment, topLevelPageOf } from "@/server/db/repos/comments";
import { jsonOk } from "@/server/http/json";
import { readJson } from "@/server/http/read-json";
import { createComment, toCommentDto } from "@/server/interactions/comments";
import { interactionRoute } from "@/server/interactions/route";
import { COMMENTS_PER_PAGE } from "@/server/share/load-interactions";

/** Comment on a post page: as the signed-in viewer, or anonymous (proof of work required; see /comments/challenge). */
export const POST = interactionRoute<RouteContext<"/api/v1/p/[slug]/comments">>("comments.create", async ({ request, context, db, actor }) => {
  const comment = await createComment(db, (await context.params).slug, actor, await readJson(request, 16_384));
  // Page of the thread that now holds the comment, so the client can jump to it.
  const top = comment.parent_id ? await findComment(db, comment.parent_id) : comment;
  const page = top ? await topLevelPageOf(db, top, COMMENTS_PER_PAGE) : 1;
  return jsonOk({ comment: toCommentDto(comment), page }, 201);
});
