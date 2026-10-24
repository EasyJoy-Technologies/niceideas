import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { Media, MediaState } from "@/server/db/schema";
import { findMediaByRefs, mediaJobStates, upsertMediaJob } from "@/server/db/repos/media-jobs";
import type { SourceDocument } from "@/server/documents/source-schema";
import { sourceMediaBlocks } from "@/server/documents/stored";
import { badRequest } from "@/server/http/errors";
import type { PushContentInput } from "./requests";

/** A media of the document that failed (job `failed` = temporary, `rejected` = permanent) with its reason code. */
export type FailedRef = { ref: string; reason: string };
export type ResolvedShareMedia = { media: Media[]; mediaIds: string[]; firstImageId: string | null; state: MediaState; failed: FailedRef[] };

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
 * Queues fetching of the document's media not stored yet, with the pushed grants (a new grant URL
 * queues a temporary failure again; permanent failures are never fetched again).
 */
export async function queueShareMedia(db: Db, ownerId: string, doc: SourceDocument, grants: PushContentInput["media"]): Promise<void> {
  const blocks = sourceMediaBlocks(doc);
  const stored = await findMediaByRefs(db, ownerId, [...new Set(blocks.map((b) => b.ref))]);
  const seen = new Set<string>();
  for (const b of blocks) {
    if (stored.get(b.ref)?.kind === b.type || seen.has(b.ref)) continue;
    seen.add(b.ref);
    const g = grants[b.ref];
    await upsertMediaJob(db, ownerId, { ref: b.ref, kind: b.type, mime: b.mime, bytes: b.bytes, url: g?.url ?? null, expiresAt: g?.expiresAt ? new Date(g.expiresAt) : null });
  }
}

/**
 * Media of a NiceNote document as stored now: refs already stored are used as they are. The post's
 * media state is `complete` when every ready block is stored, `partial` when one failed, else `processing`.
 */
export async function resolveShareMedia(db: Db, ownerId: string, doc: SourceDocument): Promise<ResolvedShareMedia> {
  const blocks = sourceMediaBlocks(doc);
  const refs = [...new Set(blocks.map((b) => b.ref))];
  const found = await findMediaByRefs(db, ownerId, refs);
  const kindOf = new Map(blocks.map((b) => [b.ref, b.type]));
  const stored = new Map([...found].filter(([ref, m]) => m.kind === kindOf.get(ref)));
  const missing = refs.filter((r) => !stored.has(r));
  const jobs = await mediaJobStates(db, ownerId, missing);
  const failed = missing.flatMap((ref) => {
    const j = jobs.get(ref);
    if (j?.state === "rejected" || j?.state === "failed") return [{ ref, reason: j.error ?? "temporarily_unavailable" }];
    // Stored, but as the other kind (an image block pointing at audio): permanently unusable here.
    return found.has(ref) ? [{ ref, reason: "unsupported_format" }] : [];
  });
  const state: MediaState = failed.length ? "partial" : missing.length ? "processing" : "complete";
  const media = refs.flatMap((r) => (stored.has(r) ? [stored.get(r)!] : []));
  const firstImage = blocks.find((b) => b.type === "image" && stored.has(b.ref));
  return { media, mediaIds: media.map((m) => m.id), firstImageId: firstImage ? stored.get(firstImage.ref)!.id : null, state, failed };
}
