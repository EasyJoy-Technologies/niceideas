import { jsonOk } from "@/server/http/json";
import { setPostLike } from "@/server/interactions/likes";
import { interactionRoute } from "@/server/interactions/route";

type Ctx = RouteContext<"/api/v1/p/[slug]/like">;

/** Like (POST) / unlike (DELETE) a post as a visitor; idempotent. */
export const POST = interactionRoute<Ctx>("posts.like", async ({ context, db, visitor }) =>
  jsonOk(await setPostLike(db, (await context.params).slug, visitor, true)),
);
export const DELETE = interactionRoute<Ctx>("posts.unlike", async ({ context, db, visitor }) =>
  jsonOk(await setPostLike(db, (await context.params).slug, visitor, false)),
);
