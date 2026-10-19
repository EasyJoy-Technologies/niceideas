import { authenticateFirstParty } from "@/server/auth/authenticate";
import { listLiveBySources } from "@/server/db/repos/posts";
import { apiRoute } from "@/server/http/api-route";
import { badRequest } from "@/server/http/errors";
import { jsonOk } from "@/server/http/json";
import { postUrl } from "@/server/posts/post-dto";
import { postRuntime } from "@/server/posts/runtime";

/**
 * Live publications of the caller's notes (multi-device sync lookup, plan §8).
 * `?source=nicenote` covers both regions: one person may publish from either app.
 */
export const GET = apiRoute("me.sources", "publish_api", async (request) => {
  const principal = await authenticateFirstParty(request);
  if (new URL(request.url).searchParams.get("source") !== "nicenote") throw badRequest("request.invalid", { param: "source" });
  const rows = await listLiveBySources(postRuntime().db, principal.userId, ["nicenote_intl", "nicenote_cn"]);
  return jsonOk({
    items: rows.map((r) => ({
      id: r.id,
      url: postUrl(r.slug),
      source: r.source,
      sourceRef: r.source_ref,
      syncMode: r.sync_mode,
      kind: r.kind,
      contentHash: r.content_hash,
      sourceUpdatedAt: r.source_updated_at?.toISOString() ?? null,
      updatedAt: r.updated_at.toISOString(),
    })),
  });
});
