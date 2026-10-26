import type { PostKind } from "@/server/db/schema";
import { escapeMarkdown } from "@/server/render/escape";
import { deriveTitle } from "./derive";
import { isSourceDocument, type StoredDocument } from "./stored";

/**
 * Short posts have no title line: a title they carry (NiceNote, API) shows as the bold first
 * line of the text — on the post page, in the feed and in the editor. Its length counts toward
 * the short limit (deriveKind). Articles and untitled documents are returned as they are.
 */
export function withTitleInText(kind: PostKind, doc: StoredDocument): StoredDocument {
  const title = deriveTitle(doc);
  if (kind !== "short" || !title) return doc;
  if (isSourceDocument(doc)) {
    return { ...doc, title: undefined, blocks: [{ type: "rich", lines: [{ kind: "paragraph", runs: [{ text: title, bold: true, href: undefined }] }] }, ...doc.blocks] };
  }
  return { ...doc, title: undefined, blocks: [{ type: "text", format: "markdown", text: `**${escapeMarkdown(title)}**` }, ...doc.blocks] };
}
