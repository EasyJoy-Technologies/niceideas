import type { Post, PostUpdate } from "@/server/db/schema";
import { deriveCoverMediaId, deriveKind, deriveSummary, deriveTitle, documentPlainText } from "@/server/documents/derive";
import type { PostDocument } from "@/server/documents/schema";
import { documentMediaIds } from "@/server/documents/validate";

/** Searchable text is capped (very long articles are matched on their first part). */
const SEARCH_TEXT_MAX = 20_000;

type Locks = Pick<Post, "kind_locked" | "summary_locked" | "cover_locked" | "kind" | "summary" | "cover_media_id">;

/**
 * Feed-facing fields recomputed from the document. Author overrides (locked
 * fields) are kept, except a locked cover that the new document no longer contains.
 */
export function derivedFields(doc: PostDocument, current?: Locks): Pick<PostUpdate, "title" | "kind" | "summary" | "cover_media_id" | "cover_locked" | "search_text"> {
  const ids = documentMediaIds(doc);
  const keepCover = !!current?.cover_locked && !!current.cover_media_id && ids.includes(current.cover_media_id);
  return {
    title: deriveTitle(doc),
    kind: current?.kind_locked ? current.kind : deriveKind(doc),
    summary: current?.summary_locked ? current.summary : deriveSummary(doc),
    cover_media_id: keepCover ? current!.cover_media_id : deriveCoverMediaId(doc),
    cover_locked: keepCover,
    search_text: `${deriveTitle(doc)}\n${documentPlainText(doc)}`.slice(0, SEARCH_TEXT_MAX),
  };
}
