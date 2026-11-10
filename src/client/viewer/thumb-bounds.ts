import type PhotoSwipeLightbox from "photoswipe/lightbox";

/**
 * Where the image shows inside its page thumbnail, for the open / close animation. PhotoSwipe assumes the
 * image fills the <img> box (or, for data-cropped, is cropped around its centre). Post-page images may
 * be letterboxed (object-fit: contain, capped height) or cropped to their top part (long images,
 * object-position: top): the bounds follow the <img>'s computed object-fit and object-position.
 */
type Bounds = { x: number; y: number; w: number; innerRect?: { x: number; y: number; w: number; h: number } };

/** Fraction (0–1) of an object-position component ("50%", "0%"); other forms count as centred. */
const fraction = (part: string | undefined) => (part?.endsWith("%") ? parseFloat(part) / 100 : 0.5);

export function contentBounds(img: HTMLElement, width: number, height: number): Bounds | null {
  const style = getComputedStyle(img);
  const fit = style.objectFit;
  if ((fit !== "contain" && fit !== "cover") || !width || !height) return null;
  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scales = [rect.width / width, rect.height / height];
  const scale = fit === "contain" ? Math.min(...scales) : Math.max(...scales);
  const [px, py] = style.objectPosition.split(" ");
  const offsetX = (rect.width - width * scale) * fraction(px);
  const offsetY = (rect.height - height * scale) * fraction(py);
  const bounds: Bounds = { x: rect.left + offsetX, y: rect.top + offsetY, w: width * scale };
  // Cropped: the visible part is the <img> box (PhotoSwipe animates the crop from it).
  if (fit === "cover" && (width * scale > rect.width + 0.5 || height * scale > rect.height + 0.5)) bounds.innerRect = { x: offsetX, y: offsetY, w: rect.width, h: rect.height };
  return bounds;
}

export function bindThumbBounds(lightbox: PhotoSwipeLightbox): void {
  lightbox.addFilter("thumbBounds", (bounds, itemData) => {
    const img = itemData.element?.querySelector("img");
    // PhotoSwipe's own bounds otherwise (undefined when it has none: no zoom animation; its typing omits that).
    return (img && contentBounds(img, itemData.width ?? 0, itemData.height ?? 0)) || (bounds as Bounds);
  });
}
