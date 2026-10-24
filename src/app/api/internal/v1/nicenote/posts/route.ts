import { jsonOk } from "@/server/http/json";
import { createShare } from "@/server/nicenote/create-share";
import { toSourcePostDto } from "@/server/nicenote/dto";
import { createShareBody, parseBody } from "@/server/nicenote/requests";
import { sourceRoute } from "@/server/nicenote/source-route";

/** NiceMatrix backend: create the post of a NiceNote share (idempotent by shareId). */
export const POST = sourceRoute("nicenote.create", async ({ db, json }) => {
  const input = parseBody(createShareBody, json);
  const { post, created } = await createShare(db, input);
  console.info(JSON.stringify({ event: "nicenote_share", action: "create", postId: post.id, created, region: input.region }));
  return jsonOk({ post: toSourcePostDto(post) }, created ? 201 : 200);
});
