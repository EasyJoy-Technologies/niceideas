import type { Media, Post } from "@/server/db/schema";
import type { SourceBlock } from "@/server/documents/source-schema";
import type { StoredDocument } from "@/server/documents/stored";
import type { DocBlock } from "@/server/documents/schema";
import { publicUrl } from "@/server/media/keys";
import { blockMarkdown, type PmNode } from "./editor-markdown";
import { markdownToEditor, plainToEditor } from "./markdown-editor";
import { linesToEditor, runsToEditor } from "./source-editor";

/** Kept details of an existing media block (caption / description / audio title). */
export type MediaMeta = { alt?: string; caption?: string; title?: string };
/** An already stored image / audio shown in the editor (thumbnail or player from the public store). */
export type EditMedia = { mediaId: string; kind: "image" | "audio"; url: string; meta: MediaMeta };

/** What the edit page opens with: the editor document, short-post media (tray), and the no-JS text. */
export type EditPrefill = { mode: "short" | "long"; title: string; doc: PmNode; tray: EditMedia[]; text: string; keep: Pick<EditMedia, "mediaId" | "kind">[] };

function mediaOf(m: Media | undefined, meta: MediaMeta): EditMedia | null {
  if (!m) return null;
  const v = m.variants;
  const key = v.kind === "image" ? (v.webp[0] ?? v.fallback).key : v.original.key;
  return { mediaId: m.id, kind: m.kind === "audio" ? "audio" : "image", url: publicUrl(key), meta };
}

const metaOf = (b: { alt?: string; caption?: string; title?: string }): MediaMeta =>
  Object.fromEntries(Object.entries({ alt: b.alt, caption: b.caption, title: b.title }).filter(([, v]) => v)) as MediaMeta;

const todo = (items: { checked: boolean; content: PmNode[] }[]): PmNode => ({
  type: "taskList",
  content: items.map((i) => ({ type: "taskItem", attrs: { checked: i.checked }, content: [i.content.length ? { type: "paragraph", content: i.content } : { type: "paragraph" }] })),
});

/** One document block → editor nodes or a media item; null for blocks without content (pending media). */
function blockNodes(b: DocBlock | SourceBlock, media: ReadonlyMap<string, Media>): PmNode[] | EditMedia | null {
  switch (b.type) {
    case "text":
      return "format" in b && b.format === "markdown" ? markdownToEditor(b.text) : plainToEditor(b.text);
    case "rich":
      return linesToEditor(b.lines);
    case "todo":
      return [todo(b.items.map((i) => ({ checked: i.checked, content: "runs" in i ? runsToEditor(i.runs) : i.text ? [{ type: "text", text: i.text }] : [] })))];
    case "image":
    case "audio": {
      if ("mediaId" in b) return mediaOf(media.get(b.mediaId), metaOf(b));
      return b.state === "ready" ? mediaOf(media.get(b.ref), metaOf(b)) : null;
    }
  }
}

/**
 * Stored document → edit prefill. `media`: as loaded for the page (by media id, or by NiceNote ref).
 * Short posts keep their media under the text (tray); articles have them in place.
 */
export function editPrefill(post: Pick<Post, "kind">, doc: StoredDocument, media: ReadonlyMap<string, Media>): EditPrefill {
  const mode = post.kind === "short" ? "short" : "long";
  const content: PmNode[] = [];
  const tray: EditMedia[] = [];
  const placed: EditMedia[] = [];
  for (const b of doc.blocks) {
    const r = blockNodes(b, media);
    if (!r) continue;
    if (Array.isArray(r)) content.push(...r);
    else if (mode === "short") tray.push(r);
    else {
      placed.push(r);
      content.push({ type: r.kind, attrs: { mediaId: r.mediaId, url: r.url, meta: r.meta } });
    }
  }
  const title = mode === "long" ? (doc.title ?? "") : "";
  const keep = [...placed, ...tray].map(({ mediaId, kind }) => ({ mediaId, kind }));
  const text = content.map((n) => blockMarkdown(n, () => undefined)).filter(Boolean).join("\n\n");
  return { mode, title, doc: { type: "doc", content }, tray, text, keep };
}
