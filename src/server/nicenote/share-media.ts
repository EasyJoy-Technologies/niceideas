import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { Media, MediaState } from "@/server/db/schema";
import { findMediaByRefs, mediaJobStates, upsertMediaJob } from "@/server/db/repos/media-jobs";
import type { SourceDocument } from "@/server/documents/source-schema";
import { sourceMediaBlocks } from "@/server/documents/stored";
import { badRequest } from "@/server/http/errors";
import type { PushContentInput } from "./requests";

export type ResolvedShareMedia = { media: Media[]; mediaIds: string[]; firstImageId: string | null; state: MediaState };

const GRANT_PATH = "/v1/internal/niceideas/media/";

/** Grant URLs may only point at the NiceMatrix media grant endpoint (never anywhere else: SSRF guard). */
export function isAllowedGrantUrl(url: string): boolean {
  let u: URL;
  let base: URL;
  try {
    u = new URL(url);
    base = new URL(getConfig().NICEMATRIX_API_URL);
  } catch {
    return false;
  }
  return u.protocol === base.protocol && u.host === base.host && u.pathname.startsWith(GRANT_PATH) && !u.username && !u.password && !u.hash;
}

export function assertGrants(grants: PushContentInput["media"]): void {
  for (const [ref, g] of Object.entries(grants)) if (!isAllowedGrantUrl(g.url)) throw badRequest("media.grant_invalid", { ref });
}

/**
 * Media of a pushed NiceNote document: refs already stored for the owner are used as they are;
 * the others are queued for fetching (a new grant URL revives a failed fetch). The post's media
 * state is `complete` when every ready block is stored, `partial` when one failed, else `processing`.
 */
export async function resolveShareMedia(db: Db, ownerId: string, doc: SourceDocument, grants: PushContentInput["media"]): Promise<ResolvedShareMedia> {
  const blocks = sourceMediaBlocks(doc);
  const refs = [...new Set(blocks.map((b) => b.ref))];
  const stored = new Map((await findMediaByRefs(db, ownerId, refs)).map((m) => [m.source_ref!, m]));
  const missing: string[] = [];
  for (const b of blocks) {
    if (stored.get(b.ref)?.kind === b.type || missing.includes(b.ref)) continue;
    missing.push(b.ref);
    const g = grants[b.ref];
    await upsertMediaJob(db, ownerId, { ref: b.ref, kind: b.type, mime: b.mime, bytes: b.bytes, url: g?.url ?? null, expiresAt: g?.expiresAt ? new Date(g.expiresAt) : null });
  }
  const states = await mediaJobStates(db, ownerId, missing);
  const failed = missing.some((r) => states.get(r) === "failed");
  const state: MediaState = failed ? "partial" : missing.length ? "processing" : "complete";
  const media = refs.flatMap((r) => (stored.has(r) && !missing.includes(r) ? [stored.get(r)!] : []));
  const firstImage = blocks.find((b) => b.type === "image" && stored.get(b.ref)?.kind === "image");
  return { media, mediaIds: media.map((m) => m.id), firstImageId: firstImage ? stored.get(firstImage.ref)!.id : null, state };
}
