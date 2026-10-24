import type { PhotoSwipeOptions, SlideData } from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

/**
 * How images open and zoom (plan docs/plan/2026-10-24-image-viewer.md §2). Zoom levels are relative to
 * the most detailed rendition (the link's data-pswp-width / -height).
 */
type Point = { x: number; y: number };
type ZoomLevel = { fit: number; elementSize: Point | null; panAreaSize: Point | null };

/** The post column (42rem): long images read at this width on wide screens. */
const COLUMN_PX = 672;
/** Wide screens leave room around the image for the bar, arrows and caption. */
const WIDE_PX = 768;

/** Long images (at least 3× taller than wide, e.g. long screenshots). */
export const isLongItem = (item: SlideData | undefined) => !!item?.width && !!item.height && item.height >= 3 * item.width;
const isLong = (zl: ZoomLevel) => !!zl.elementSize && zl.elementSize.y >= 3 * zl.elementSize.x;

/** Photos open whole; long images at reading width (the screen on phones, the post column on wide screens). */
function initial(zl: ZoomLevel): number {
  const { elementSize: el, panAreaSize: view } = zl;
  if (!el || !view || !isLong(zl)) return zl.fit;
  return Math.max(zl.fit, Math.min(1, Math.min(view.x, COLUMN_PX) / el.x));
}

export const zoomOptions: PhotoSwipeOptions = {
  initialZoomLevel: initial,
  // Double-tap / click: about 3× (at least 2×, so small images zoom too).
  secondaryZoomLevel: (zl) => Math.max(initial(zl) * 2, isLong(zl) ? 0 : Math.min(1, zl.fit * 3)),
  maxZoomLevel: (zl) => Math.max(1, initial(zl) * 4),
  paddingFn: (view, item) => {
    if (view.x >= WIDE_PX) return { top: 72, bottom: 72, left: 88, right: 88 };
    // Phones: edge to edge; long images start below the bar.
    return { top: isLongItem(item) ? 64 : 0, bottom: 0, left: 0, right: 0 };
  },
};

/** Long images start at the top; the mouse wheel zooms photos and scrolls long images. */
export function bindZoomBehaviour(lightbox: PhotoSwipeLightbox): void {
  lightbox.on("initialZoomPan", ({ slide }) => {
    // PhotoSwipe pan bounds: min = top edge, max = bottom edge.
    if (isLong(slide.zoomLevels)) slide.pan.y = slide.bounds.min.y;
  });
  lightbox.on("change", () => {
    const pswp = lightbox.pswp;
    if (pswp) pswp.options.wheelToZoom = !isLongItem(pswp.currSlide?.data);
  });
}
