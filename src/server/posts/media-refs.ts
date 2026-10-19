import type { Db } from "@/server/db/client";
import type { Media } from "@/server/db/schema";
import { findMediaByIds } from "@/server/db/repos/media";
import type { PostDocument } from "@/server/documents/schema";
import { documentMediaIds } from "@/server/documents/validate";
import { ApiError } from "@/server/http/errors";

/**
 * Loads every media referenced by the document and checks it belongs to the
 * author and matches the block type. Returns them in document order.
 */
export async function resolveDocumentMedia(db: Db, authorId: string, doc: PostDocument): Promise<Media[]> {
  const ids = documentMediaIds(doc);
  const rows = new Map((await findMediaByIds(db, ids)).map((m) => [m.id, m]));
  const invalid: string[] = [];
  for (const b of doc.blocks) {
    if (b.type !== "image" && b.type !== "audio") continue;
    const m = rows.get(b.mediaId);
    if (!m || m.owner_id !== authorId || m.kind !== b.type) invalid.push(b.mediaId);
  }
  if (invalid.length) throw new ApiError("document.media_invalid", 422, { mediaIds: [...new Set(invalid)] });
  return ids.map((id) => rows.get(id)!);
}
