import type { Media } from "@/server/db/schema";
import type { DocBlock, PostDocument } from "@/server/documents/schema";
import { escapeHtml, plainTextToHtml } from "./escape";
import { renderMarkdown } from "./markdown";

/** Media lookup for rendering; a missing entry renders nothing (never a broken element). */
export type MediaIndex = ReadonlyMap<string, Media>;
/** Maps a stored object key to its public URL (injected; keeps rendering pure). */
export type MediaUrl = (key: string) => string;

const IMAGE_SIZES = "(min-width: 48rem) 42rem, 100vw";

function imageHtml(b: Extract<DocBlock, { type: "image" }>, media: Media | undefined, eager: boolean, publicUrl: MediaUrl): string {
  if (!media || media.variants.kind !== "image") return "";
  const v = media.variants;
  const srcset = v.webp.map((r) => `${publicUrl(r.key)} ${r.width}w`).join(", ");
  const largest = v.webp.at(-1) ?? v.fallback;
  const alt = escapeHtml(b.alt ?? b.caption ?? "");
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  const img =
    `<picture><source type="image/webp" srcset="${srcset}" sizes="${IMAGE_SIZES}">` +
    `<img src="${publicUrl(v.fallback.key)}" width="${v.fallback.width}" height="${v.fallback.height}" alt="${alt}" ${loading} decoding="async"></picture>`;
  const zoom = `<a class="ni-zoom" href="${publicUrl(largest.key)}" data-lightbox>${img}</a>`;
  const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : "";
  return `<figure class="ni-image">${zoom}${caption}</figure>`;
}

function audioHtml(b: Extract<DocBlock, { type: "audio" }>, media: Media | undefined, publicUrl: MediaUrl): string {
  if (!media || media.variants.kind !== "audio") return "";
  const o = media.variants.original;
  const title = b.title ? `<figcaption>${escapeHtml(b.title)}</figcaption>` : "";
  const label = b.title ? ` aria-label="${escapeHtml(b.title)}"` : "";
  return `<figure class="ni-audio">${title}<audio controls preload="metadata"${label}><source src="${publicUrl(o.key)}" type="${o.mime}"></audio></figure>`;
}

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

/**
 * Normalized document → safe HTML body (plan §6). Only structured blocks are
 * rendered; author text is escaped (plain) or parsed with raw HTML disabled
 * and sanitized (markdown). The first image loads eagerly (largest paint).
 */
export function renderDocumentHtml(doc: PostDocument, media: MediaIndex, publicUrl: MediaUrl): string {
  let firstImage = true;
  return doc.blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return `<div class="ni-text">${b.format === "markdown" ? renderMarkdown(b.text) : plainTextToHtml(b.text)}</div>`;
        case "todo":
          return todoHtml(b);
        case "image": {
          const html = imageHtml(b, media.get(b.mediaId), firstImage, publicUrl);
          if (html) firstImage = false;
          return html;
        }
        case "audio":
          return audioHtml(b, media.get(b.mediaId), publicUrl);
      }
    })
    .join("\n");
}
