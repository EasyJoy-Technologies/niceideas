import { jsonOk } from "@/server/http/json";
import { setCommentLike } from "@/server/interactions/likes";
import { interactionRoute } from "@/server/interactions/route";

type Ctx = RouteContext<"/api/v1/comments/[id]/like">;

export const POST = interactionRoute<Ctx>("comments.like", async ({ context, db, actor }) =>
  jsonOk(await setCommentLike(db, (await context.params).id, actor, true)),
);
export const DELETE = interactionRoute<Ctx>("comments.unlike", async ({ context, db, actor }) =>
  jsonOk(await setCommentLike(db, (await context.params).id, actor, false)),
);
