import PhotoSwipe from "photoswipe";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { bindBackButton } from "./back-button";
import { bindUi, iconOptions } from "./ui";
import { bindZoomBehaviour, zoomOptions } from "./zoom";

/**
 * Image viewer (/scripts/viewer.js, loaded on pages with images; plan docs/plan/2026-10-24-image-viewer.md):
 * zoom, pan, swipe between the images of one post body or feed card, in page order. Links come from
 * `zoomLink` (src/server/render/media-html.ts; PhotoSwipe reads its data-pswp-* and data-cropped, so feed
 * squares open from the crop); without JS they open the image. Labels: data-* on <body>.
 */
const GROUP = ".ni-body";
const LINK = "a.ni-zoom";

function setup(): void {
  const labels = document.body.dataset;
  const lightbox = new PhotoSwipeLightbox({
    pswpModule: PhotoSwipe,
    children: LINK,
    loop: false,
    bgOpacity: 1,
    preloaderDelay: 1000,
    showHideAnimationType: "zoom",
    closeTitle: labels.closeLabel,
    zoomTitle: labels.zoomLabel,
    arrowPrevTitle: labels.prevLabel,
    arrowNextTitle: labels.nextLabel,
    errorMsg: labels.imageErrorLabel,
    ...iconOptions,
    ...zoomOptions,
  });
  bindZoomBehaviour(lightbox);
  bindUi(lightbox, labels.viewerLabel ?? "");
  bindBackButton(lightbox);

  // One delegated listener (no lightbox.init()): every group on the page, also ones added later.
  document.addEventListener("click", (e) => {
    const link = (e.target as Element | null)?.closest?.<HTMLAnchorElement>(LINK);
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!link.dataset.pswpWidth) return; // size unknown: the link opens the image
    const group = link.closest<HTMLElement>(GROUP) ?? link;
    const links = [...group.querySelectorAll<HTMLAnchorElement>(LINK)];
    e.preventDefault();
    lightbox.loadAndOpen(Math.max(0, links.indexOf(link)), { gallery: group }, e.detail ? { x: e.clientX, y: e.clientY } : null);
  });
}

setup();
