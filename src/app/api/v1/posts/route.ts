import { authenticateFirstParty } from "@/server/auth/authenticate";
import { apiRoute } from "@/server/http/api-route";
import { withIdempotency } from "@/server/http/idempotency";
import { readJson } from "@/server/http/read-json";
import { createPost } from "@/server/posts/create-post";
import { toPostDto } from "@/server/posts/post-dto";
import { parseCreateRequest } from "@/server/posts/requests";
import { postRuntime } from "@/server/posts/runtime";
import { ensureProfile } from "@/server/profiles/ensure-profile";

/** Publish a note. Re-sharing the same note returns the existing link (200). */
export const POST = apiRoute("posts.create", "publish_api", async (request) => {
  const principal = await authenticateFirstParty(request);
  const payload = await readJson(request);
  const input = parseCreateRequest(payload);
  const { db, stores, cacheControl } = postRuntime();
  await ensureProfile(db, principal.userId);
  return withIdempotency(db, request, { scope: `${principal.userId}:posts.create`, payload }, async () => {
    const result = await createPost(db, stores, principal, input, cacheControl);
    return { status: result.created ? 201 : 200, body: { post: toPostDto(result.post, result.contentHash) } };
  });
});
