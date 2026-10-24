import type { Media, MediaJobState } from "@/server/db/schema";
import type { DocBlock, PostDocument } from "@/server/documents/schema";
import { isSourceDocument, type StoredDocument } from "@/server/documents/stored";
import { escapeHtml, plainTextToHtml } from "./escape";
import { renderMarkdown } from "./markdown";
import { audioFigure, imageFigure, type MediaUrl } from "./media-html";
import { renderSourceHtml } from "./source-html";

export type { MediaUrl } from "./media-html";
/** Media lookup for rendering, by media id (API documents) or NiceNote ref; a missing entry renders nothing. */
export type MediaIndex = ReadonlyMap<string, Media>;
/** NiceNote documents: fetch state per ref and the placeholder texts. */
export type RenderOptions = { jobs?: ReadonlyMap<string, MediaJobState>; labels?: { processing: string; unavailable: string } };

function todoHtml(b: Extract<DocBlock, { type: "todo" }>): string {
  const items = b.items
    .map((i) => {
      const state = i.checked ? " ni-done" : "";
      const box = `<input type="checkbox" disabled${i.checked ? " checked" : ""}>`;
      return `<li class="ni-todo-item${state}"><label>${box}<span>${escapeHtml(i.text)}</span></label></li>`;
    })
    .join("");
  return `<ul class="ni-todo">${items}</ul>`;
}

function apiDocumentHtml(doc: PostDocument, media: MediaIndex, publicUrl: MediaUrl): string {
  let firstImage = true;
  return doc.blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return `<div class="ni-text">${b.format === "markdown" ? renderMarkdown(b.text) : plainTextToHtml(b.text)}</div>`;
        case "todo":
          return todoHtml(b);
        case "image": {
          const html = imageFigure(media.get(b.mediaId), b, firstImage, publicUrl);
          if (html) firstImage = false;
          return html;
        }
        case "audio":
          return audioFigure(media.get(b.mediaId), b.title, publicUrl);
      }
    })
    .join("\n");
}

/**
 * Stored document → safe HTML body (plan §6). Only structured blocks are rendered; author text
 * is escaped (plain), parsed with raw HTML disabled and sanitized (markdown), or rendered from
 * NiceNote's structured lines. The first image loads eagerly (largest paint).
 */
export function renderDocumentHtml(doc: StoredDocument, media: MediaIndex, publicUrl: MediaUrl, opts: RenderOptions = {}): string {
  return isSourceDocument(doc) ? renderSourceHtml(doc, media, publicUrl, opts) : apiDocumentHtml(doc, media, publicUrl);
}
