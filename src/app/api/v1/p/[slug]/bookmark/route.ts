import { jsonOk } from "@/server/http/json";
import { setBookmark } from "@/server/interactions/bookmarks";
import { interactionRoute } from "@/server/interactions/route";

type Ctx = RouteContext<"/api/v1/p/[slug]/bookmark">;

/** Save (POST) / unsave (DELETE) a post for the signed-in viewer; idempotent. */
export const POST = interactionRoute<Ctx>("posts.bookmark", async ({ context, db, actor }) =>
  jsonOk(await setBookmark(db, (await context.params).slug, actor, true)),
);
export const DELETE = interactionRoute<Ctx>("posts.unbookmark", async ({ context, db, actor }) =>
  jsonOk(await setBookmark(db, (await context.params).slug, actor, false)),
);
