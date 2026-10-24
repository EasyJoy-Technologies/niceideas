import { documentSchema, type DocBlock, type PostDocument } from "./schema";
import { storedSourceDocumentSchema, type SourceBlock, type SourceDocument, type SourceMediaBlock, type SourceRun } from "./source-schema";

/** A stored revision document: the API format, or a NiceNote share (origin "nicenote"). */
export type StoredDocument = PostDocument | SourceDocument;
export type AnyBlock = DocBlock | SourceBlock;

export const isSourceDocument = (doc: StoredDocument): doc is SourceDocument => (doc as SourceDocument).origin === "nicenote";

/** Stored documents were validated on write; a parse failure here is a server bug. */
export function parseStoredDocument(json: unknown): StoredDocument {
  return (json as { origin?: unknown })?.origin === "nicenote" ? storedSourceDocumentSchema.parse(json) : documentSchema.parse(json);
}

export const runsText = (runs: SourceRun[]) => runs.map((r) => r.text).join("");

/** Media lookup key of a media block: the media id (API format) or the NiceNote ref (ready blocks); null when pending. */
export function blockMediaKey(b: AnyBlock): string | null {
  if (b.type !== "image" && b.type !== "audio") return null;
  if ("mediaId" in b) return b.mediaId;
  return b.state === "ready" ? b.ref : null;
}

/** Ready media blocks of a NiceNote document, in order. */
export function sourceMediaBlocks(doc: SourceDocument): SourceMediaBlock[] {
  return doc.blocks.filter((b): b is SourceMediaBlock => (b.type === "image" || b.type === "audio") && b.state === "ready");
}

/** Distinct media keys (ids or refs) in document order. */
export function documentMediaKeys(doc: StoredDocument): string[] {
  const keys: string[] = [];
  for (const b of doc.blocks) {
    const k = blockMediaKey(b);
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** Same document with only the blocks matching `keep` (type-preserving). */
export function withBlocks(doc: StoredDocument, keep: (b: AnyBlock) => boolean): StoredDocument {
  return isSourceDocument(doc) ? { ...doc, blocks: doc.blocks.filter(keep) } : { ...doc, blocks: doc.blocks.filter(keep) };
}
