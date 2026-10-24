import { jsonOk } from "@/server/http/json";
import { toSourcePostDto } from "@/server/nicenote/dto";
import { deleteShare, loadShare, updateShareSettings } from "@/server/nicenote/manage-share";
import { parseBody, shareSettingsBody } from "@/server/nicenote/requests";
import { sourceRoute } from "@/server/nicenote/source-route";
import { postRuntime } from "@/server/posts/runtime";

type Ctx = RouteContext<"/api/internal/v1/nicenote/posts/[id]">;

export const GET = sourceRoute<Ctx>("nicenote.get", async ({ db }, ctx) => jsonOk({ post: toSourcePostDto(await loadShare(db, (await ctx.params).id)) }));

export const PATCH = sourceRoute<Ctx>("nicenote.settings", async ({ db, json }, ctx) => {
  const post = await updateShareSettings(db, (await ctx.params).id, parseBody(shareSettingsBody, json));
  return jsonOk({ post: toSourcePostDto(post) });
});

/** The user deleted the share in NiceNote. Idempotent. */
export const DELETE = sourceRoute<Ctx>("nicenote.delete", async ({ db }, ctx) => {
  const { stores, retentionDays } = postRuntime();
  const post = await deleteShare(db, stores, (await ctx.params).id, retentionDays);
  console.info(JSON.stringify({ event: "nicenote_share", action: "delete", postId: post.id }));
  return jsonOk({ post: toSourcePostDto(post) });
});
