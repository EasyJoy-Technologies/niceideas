import type { Db } from "@/server/db/client";
import type { Media, MediaJobState } from "@/server/db/schema";
import { findMediaByIds } from "@/server/db/repos/media";
import { findMediaByRefs, mediaJobStates } from "@/server/db/repos/media-jobs";
import { documentMediaKeys, isSourceDocument, type StoredDocument } from "@/server/documents/stored";

export type DocumentMedia = { media: ReadonlyMap<string, Media>; jobs: ReadonlyMap<string, MediaJobState> };

export const NO_DOCUMENT_MEDIA: DocumentMedia = { media: new Map(), jobs: new Map() };

/**
 * Media needed to render a stored document, keyed like its blocks: by media id (API documents)
 * or by NiceNote ref (share documents, plus the fetch state of refs not stored yet).
 */
export async function loadDocumentMedia(db: Db, ownerId: string, doc: StoredDocument): Promise<DocumentMedia> {
  const keys = documentMediaKeys(doc);
  if (keys.length === 0) return NO_DOCUMENT_MEDIA;
  if (!isSourceDocument(doc)) return { media: new Map((await findMediaByIds(db, keys)).map((m) => [m.id, m])), jobs: new Map() };
  const stored = await findMediaByRefs(db, ownerId, keys);
  const missing = keys.filter((k) => !stored.some((m) => m.source_ref === k));
  return { media: new Map(stored.map((m) => [m.source_ref!, m])), jobs: await mediaJobStates(db, ownerId, missing) };
}
