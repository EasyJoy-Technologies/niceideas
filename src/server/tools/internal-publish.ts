import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { DocBlock } from "@/server/documents/schema";
import { parseDocument } from "@/server/documents/validate";
import { ingestUpload } from "@/server/media/ingest";
import { mediaLimitsFromConfig } from "@/server/media/limits";
import { createPost } from "@/server/posts/create-post";
import { postUrl } from "@/server/posts/post-dto";
import { withdrawPost } from "@/server/posts/withdraw-post";
import { updateProfileDisplayName } from "@/server/db/repos/profiles";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import type { MediaStores } from "@/server/storage/types";
import { removeTempDir, spoolBody } from "@/server/util/temp-file";

/**
 * Internal test publishing (execution plan step 9). Runs on the server with
 * direct service access — there is deliberately no HTTP back door. Uses the
 * same services as the publish API, so results are identical to app posts.
 */
export type ToolInput =
  | { kind: "text"; text: string; markdown: boolean }
  | { kind: "todo"; items: { text: string; checked: boolean }[] }
  | { kind: "image"; path: string; caption?: string }
  | { kind: "audio"; path: string; title?: string };

export type PublishInput = {
  userId: string;
  displayName?: string;
  sourceRef: string;
  title?: string;
  blocks: ToolInput[];
};

export type ToolRuntime = { db: Db; stores: MediaStores; cacheControl: string; retentionDays: number };

/** Tool posts are NiceIdeas posts (source `web`): NiceNote shares only come from the NiceMatrix backend. */
const principalOf = (userId: string): Principal => ({ userId, clientId: "internal-cli", kind: "first_party", source: "web" });

async function uploadFile(rt: ToolRuntime, ownerId: string, path: string): Promise<string> {
  const upload = await spoolBody(Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>, Number.MAX_SAFE_INTEGER);
  try {
    const { media } = await ingestUpload(rt.db, rt.stores.privateStore, { ownerId, upload, declaredSha256: upload.sha256, limits: mediaLimitsFromConfig() });
    return media.id;
  } finally {
    await removeTempDir(upload.dir);
  }
}

export async function publishFromTool(rt: ToolRuntime, input: PublishInput): Promise<{ id: string; url: string; created: boolean }> {
  const profile = await ensureProfile(rt.db, input.userId);
  if (input.displayName && profile.display_name !== input.displayName) {
    await updateProfileDisplayName(rt.db, input.userId, input.displayName);
  }
  const blocks: DocBlock[] = [];
  for (const b of input.blocks) {
    if (b.kind === "text") blocks.push({ type: "text", format: b.markdown ? "markdown" : "plain", text: b.text });
    else if (b.kind === "todo") blocks.push({ type: "todo", items: b.items });
    else if (b.kind === "image") blocks.push({ type: "image", mediaId: await uploadFile(rt, input.userId, b.path), ...(b.caption ? { caption: b.caption } : {}) });
    else blocks.push({ type: "audio", mediaId: await uploadFile(rt, input.userId, b.path), ...(b.title ? { title: b.title } : {}) });
  }
  // Same validation as the API (limits, empty text, …).
  const document = parseDocument({ version: 1, ...(input.title ? { title: input.title } : {}), blocks });
  const result = await createPost(rt.db, rt.stores, principalOf(input.userId), { document, sourceRef: input.sourceRef, sourceUpdatedAt: new Date() }, rt.cacheControl);
  return { id: result.post.id, url: postUrl(result.post.slug), created: result.created };
}

export async function withdrawFromTool(rt: ToolRuntime, input: { userId: string; postId: string }) {
  const post = await withdrawPost(rt.db, rt.stores, principalOf(input.userId), input.postId, rt.retentionDays);
  return { id: post.id, status: post.status, purgeAfter: post.purge_after?.toISOString() ?? null };
}
