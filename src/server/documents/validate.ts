import { badRequest } from "@/server/http/errors";
import { DOC_LIMITS, documentSchema, type PostDocument } from "./schema";

/** Strips control characters (except tab / newline) and normalizes line endings. */
function cleanText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Parses and normalizes a client document. Throws 400 `document.invalid`
 * with field paths (no values echoed back).
 */
export function parseDocument(input: unknown): PostDocument {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest("document.invalid", { issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), code: i.code })) });
  }
  const doc = parsed.data;
  const title = doc.title !== undefined ? cleanText(doc.title).trim() : undefined;
  const blocks = doc.blocks
    .map((b) => {
      if (b.type === "text") return { ...b, text: cleanText(b.text) };
      if (b.type === "todo") return { ...b, items: b.items.map((i) => ({ ...i, text: cleanText(i.text) })) };
      return b;
    })
    .filter((b) => b.type !== "text" || b.text.trim() !== "");
  if (blocks.length === 0) throw badRequest("document.empty");

  let chars = title?.length ?? 0;
  let images = 0;
  let audios = 0;
  for (const b of blocks) {
    if (b.type === "text") chars += b.text.length;
    else if (b.type === "todo") chars += b.items.reduce((n, i) => n + i.text.length, 0);
    else if (b.type === "image") images++;
    else audios++;
  }
  if (chars > DOC_LIMITS.totalChars) throw badRequest("document.too_long", { maxChars: DOC_LIMITS.totalChars });
  if (images > DOC_LIMITS.images) throw badRequest("document.too_many_images", { max: DOC_LIMITS.images });
  if (audios > DOC_LIMITS.audios) throw badRequest("document.too_many_audios", { max: DOC_LIMITS.audios });

  return { version: 1, ...(title ? { title } : {}), blocks };
}

/** Media ids referenced by the document, in order of first appearance. */
export function documentMediaIds(doc: PostDocument): string[] {
  const ids: string[] = [];
  for (const b of doc.blocks) if ((b.type === "image" || b.type === "audio") && !ids.includes(b.mediaId)) ids.push(b.mediaId);
  return ids;
}
