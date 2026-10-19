import type { PostKind } from "@/server/db/schema";
import { markdownToText } from "@/server/render/markdown";
import type { PostDocument } from "./schema";

/** Short posts show in full in the feed (plan §5). */
export const SHORT_MAX_CHARS = 500;
export const SUMMARY_CHARS = 200;

const length = (s: string) => Array.from(s).length;

/** Visible plain text of a document (title excluded), blocks separated by blank lines. */
export function documentPlainText(doc: PostDocument): string {
  const parts: string[] = [];
  for (const b of doc.blocks) {
    if (b.type === "text") parts.push(b.format === "markdown" ? markdownToText(b.text) : b.text);
    else if (b.type === "todo") parts.push(b.items.map((i) => i.text).join("\n"));
  }
  return parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
}

/** Auto kind: text/todo only, no media, ≤ 500 visible chars → short; otherwise article. */
export function deriveKind(doc: PostDocument): PostKind {
  const hasMedia = doc.blocks.some((b) => b.type === "image" || b.type === "audio");
  return !hasMedia && length(documentPlainText(doc)) <= SHORT_MAX_CHARS ? "short" : "article";
}

/** First ~200 chars of the body as one line, cut at a word boundary when possible. */
export function deriveSummary(doc: PostDocument): string {
  const flat = documentPlainText(doc).replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= SUMMARY_CHARS) return flat;
  const cut = chars.slice(0, SUMMARY_CHARS).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > SUMMARY_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function deriveTitle(doc: PostDocument): string {
  return doc.title ?? "";
}

/** First image of the document (default cover / share-card image). */
export function deriveCoverMediaId(doc: PostDocument): string | null {
  const first = doc.blocks.find((b) => b.type === "image");
  return first && first.type === "image" ? first.mediaId : null;
}
