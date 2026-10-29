import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/client";
import { linkMediaRef } from "@/server/db/repos/media-jobs";
import { parseDocument } from "@/server/documents/validate";
import { ingestUpload } from "@/server/media/ingest";
import { mediaLimitsFromConfig } from "@/server/media/limits";
import { createShare } from "@/server/nicenote/create-share";
import { pushShareContent } from "@/server/nicenote/push-content";
import { createPost } from "@/server/posts/create-post";
import { unpublishPost } from "@/server/posts/withdraw-post";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import type { MediaStores } from "@/server/storage/types";
import { removeTempDir, spoolBody } from "@/server/util/temp-file";
import type { SourceApp } from "@/server/nicenote/source-app";
import { NICENOTE_APP } from "./source-app";

type Ctx = { db: Db; stores: MediaStores };
export type Published = { id: string; slug: string };
const CACHE = "public, max-age=300";

/** Publishes an API-format document as a NiceIdeas (web-source) post through the post services. */
export async function publishAs(ctx: Ctx, userId: string, document: unknown, sourceRef: string = randomUUID()): Promise<Published> {
  await ensureProfile(ctx.db, userId);
  const principal = { userId, clientId: "test", kind: "first_party" as const, source: "web" as const };
  const r = await createPost(ctx.db, ctx.stores, principal, { document: parseDocument(document), sourceRef, sourceUpdatedAt: new Date("2026-10-20T00:00:00Z") }, CACHE);
  return { id: r.post.id, slug: r.post.slug };
}

/** Stores a media file for a user (same pipeline as uploads); returns its id. */
export async function uploadAs(ctx: Ctx, userId: string, bytes: Buffer, sourceRef?: string): Promise<string> {
  await ensureProfile(ctx.db, userId);
  const upload = await spoolBody(new Response(new Uint8Array(bytes)).body!, Number.MAX_SAFE_INTEGER);
  try {
    const { media } = await ingestUpload(ctx.db, ctx.stores.privateStore, { ownerId: userId, upload, declaredSha256: upload.sha256, limits: mediaLimitsFromConfig() });
    if (sourceRef) await linkMediaRef(ctx.db, userId, sourceRef, media);
    return media.id;
  } finally {
    await removeTempDir(upload.dir);
  }
}

/** The author deletes a post (same service as the web). */
export const deleteAs = (ctx: Ctx, postId: string) => unpublishPost(ctx.db, ctx.stores, postId, 30);

/** An app share as the NiceMatrix backend makes it (NiceNote unless `sourceApp` says otherwise): create, then push a document. */
export async function shareFromNiceNote(ctx: Ctx, userId: string, document: unknown, opts: { revision?: number; region?: "intl" | "cn"; sourceApp?: SourceApp | null } = {}): Promise<Published> {
  const sourceApp = opts.sourceApp === undefined ? NICENOTE_APP : opts.sourceApp;
  const { post } = await createShare(ctx.db, { shareId: randomUUID(), userId, region: opts.region ?? "intl", syncMode: "follow", commentsMode: null, profile: null, sourceApp });
  const pushed = await pushShareContent(ctx.db, ctx.stores, CACHE, post.id, { sourceRevision: opts.revision ?? 1, document: document as never, media: {} });
  return { id: pushed.post.id, slug: pushed.post.slug };
}
