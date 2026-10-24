import type { Media, MediaVariants } from "@/server/db/schema";
import { escapeHtml } from "./escape";

/** Maps a stored object key to its public URL (injected; keeps rendering pure). */
export type MediaUrl = (key: string) => string;

const IMAGE_SIZES = "(min-width: 48rem) 42rem, 100vw";

type ImageVariants = Extract<MediaVariants, { kind: "image" }>;

/**
 * Responsive <picture> of image variants. WebP renditions are offered as a typed source with the
 * JPEG / PNG fallback for old browsers; when some renditions are JPEG / PNG (images too tall for
 * WebP) every rendition goes into the <img> srcset. `attrs`: alt / loading attributes (escaped).
 */
export function responsivePicture(v: ImageVariants, sizes: string, attrs: string, publicUrl: MediaUrl): string {
  const srcset = v.webp.map((r) => `${publicUrl(r.key)} ${r.width}w`).join(", ");
  const img = (extra: string) =>
    `<img src="${publicUrl(v.fallback.key)}"${extra} width="${v.fallback.width}" height="${v.fallback.height}" ${attrs} decoding="async">`;
  if (v.webp.every((r) => r.mime === "image/webp")) return `<picture><source type="image/webp" srcset="${srcset}" sizes="${sizes}">${img("")}</picture>`;
  return `<picture>${img(` srcset="${srcset}" sizes="${sizes}"`)}</picture>`;
}

/** Present in a page exactly when it has images that open the viewer (pages load /scripts/viewer.js then). */
export const ZOOM_LINK_MARKER = '<a class="ni-zoom"';

/**
 * Link that opens the image viewer (/scripts/viewer.js; without JS it opens the image): points at the
 * most detailed rendition and tells the viewer its size and every rendition, so the browser downloads
 * the zoom rendition only when the view needs it. `cropped`: the thumbnail is a crop (feed squares).
 */
export function zoomLink(v: ImageVariants, inner: string, publicUrl: MediaUrl, opts: { cropped?: boolean } = {}): string {
  const top = v.large ?? v.webp.at(-1) ?? v.fallback;
  const all = [...v.webp, ...(v.large ? [v.large] : [])].filter((r) => r.width);
  const sized = top.width && top.height;
  const data = sized
    ? ` data-pswp-width="${top.width}" data-pswp-height="${top.height}" data-pswp-srcset="${all.map((r) => `${publicUrl(r.key)} ${r.width}w`).join(", ")}"${opts.cropped ? ' data-cropped="true"' : ""}`
    : "";
  return `${ZOOM_LINK_MARKER} href="${publicUrl(top.key)}"${data}>${inner}</a>`;
}

/** Responsive image opening the viewer; "" when the media is missing or not an image (never a broken element). */
export function imageFigure(media: Media | undefined, text: { alt?: string; caption?: string }, eager: boolean, publicUrl: MediaUrl): string {
  if (!media || media.variants.kind !== "image") return "";
  const v = media.variants;
  const alt = escapeHtml(text.alt ?? text.caption ?? "");
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  const zoom = zoomLink(v, responsivePicture(v, IMAGE_SIZES, `alt="${alt}" ${loading}`, publicUrl), publicUrl);
  const caption = text.caption ? `<figcaption>${escapeHtml(text.caption)}</figcaption>` : "";
  return `<figure class="ni-image">${zoom}${caption}</figure>`;
}

/** Audio player; "" when the media is missing or not audio. */
export function audioFigure(media: Media | undefined, title: string | undefined, publicUrl: MediaUrl): string {
  if (!media || media.variants.kind !== "audio") return "";
  const o = media.variants.original;
  const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : "";
  const label = title ? ` aria-label="${escapeHtml(title)}"` : "";
  return `<figure class="ni-audio">${caption}<audio controls preload="metadata"${label}><source src="${publicUrl(o.key)}" type="${o.mime}"></audio></figure>`;
}

/** Placeholder of a media block still processing or unavailable. */
export function mediaPlaceholder(kind: "image" | "audio", state: "processing" | "unavailable", label: string): string {
  return `<figure class="ni-media-ph ni-media-ph-${kind}" data-state="${state}"><span>${escapeHtml(label)}</span></figure>`;
}
