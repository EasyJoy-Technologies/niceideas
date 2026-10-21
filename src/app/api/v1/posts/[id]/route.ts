import { authenticateApi } from "@/server/auth/authenticate";
import { findRevision } from "@/server/db/repos/revisions";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { readJson } from "@/server/http/read-json";
import { loadOwnPost } from "@/server/posts/access";
import { toPostDto } from "@/server/posts/post-dto";
import { parseSettingsRequest } from "@/server/posts/requests";
import { postRuntime } from "@/server/posts/runtime";
import { updatePostSettings } from "@/server/posts/update-settings";
import { withdrawPost } from "@/server/posts/withdraw-post";

type Ctx = RouteContext<"/api/v1/posts/[id]">;

async function hashOf(revisionId: string | null): Promise<string | null> {
  return revisionId ? ((await findRevision(postRuntime().db, revisionId))?.content_hash ?? null) : null;
}

export const GET = apiRoute<Ctx>("posts.get", "publish_api", async (request, ctx) => {
  const principal = await authenticateApi(request, "posts:read");
  const post = await loadOwnPost(postRuntime().db, principal, (await ctx.params).id);
  return jsonOk({ post: toPostDto(post, await hashOf(post.current_revision_id)) });
});

/** Change summary / cover / kind / sync mode (`null` returns a field to automatic). */
export const PATCH = apiRoute<Ctx>("posts.settings", "publish_api", async (request, ctx) => {
  const principal = await authenticateApi(request, "posts:write");
  const input = parseSettingsRequest(await readJson(request));
  const post = await updatePostSettings(postRuntime().db, principal, (await ctx.params).id, input);
  return jsonOk({ post: toPostDto(post, await hashOf(post.current_revision_id)) });
});

/** Withdraw (plan §10). Idempotent. */
export const DELETE = apiRoute<Ctx>("posts.withdraw", "publish_api", async (request, ctx) => {
  const principal = await authenticateApi(request, "posts:write");
  const { db, stores, retentionDays } = postRuntime();
  const post = await withdrawPost(db, stores, principal, (await ctx.params).id, retentionDays);
  return jsonOk({ post: toPostDto(post, await hashOf(post.current_revision_id)) });
});
