import type PhotoSwipe from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import { isLongItem } from "./zoom";

/** Site stroke icons for PhotoSwipe's buttons (the theme is public/styles/viewer.css). */
const icon = (paths: string) => `<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const iconOptions = {
  closeSVG: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  zoomSVG: icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/><path class="ni-pv-plus" d="M11 8v6"/>'),
  arrowPrevSVG: icon('<path d="m15 18-6-6 6-6"/>'),
  arrowNextSVG: icon('<path d="m9 18 6-6-6-6"/>'),
  preloaderSVG: icon('<circle cx="12" cy="12" r="9"/><path d="M21 12a9 9 0 0 0-9-9"/>'),
};

/** Caption of the current image: its figure caption, else its description; none for feed thumbnails. */
function captionOf(pswp: PhotoSwipe): string {
  const link = pswp.currSlide?.data.element;
  return link?.closest("figure")?.querySelector("figcaption")?.textContent?.trim() || link?.querySelector("img")?.alt || "";
}

function registerCaption(pswp: PhotoSwipe): void {
  pswp.ui?.registerElement({
    name: "caption",
    order: 9,
    isButton: false,
    appendTo: "root",
    onInit: (el, p) => {
      el.classList.add("ni-pv-caption");
      const text = document.createElement("p");
      text.dir = "auto"; // the viewer is laid out left to right; the caption keeps its own direction
      el.append(text);
      p.on("change", () => {
        const caption = captionOf(p);
        text.textContent = caption;
        el.hidden = !caption;
      });
    },
  });
}

/** Where you are in a tall view (long images, zoomed-in photos); moving down a long image hides the caption. */
function registerTrack(pswp: PhotoSwipe): void {
  pswp.ui?.registerElement({
    name: "track",
    order: 10,
    isButton: false,
    appendTo: "root",
    onInit: (el, p) => {
      el.classList.add("ni-pv-track");
      const thumb = document.createElement("span");
      thumb.className = "ni-pv-thumb";
      el.append(thumb);
      const sync = () => {
        const s = p.currSlide;
        if (!s) return;
        const view = s.panAreaSize.y;
        const content = s.height * s.currZoomLevel;
        p.element?.classList.toggle("ni-pv-scrolled", isLongItem(s.data) && s.pan.y < s.bounds.min.y - 24);
        el.hidden = !(content > view * 1.5);
        if (el.hidden) return;
        const range = s.bounds.min.y - s.bounds.max.y || 1;
        const progress = Math.min(1, Math.max(0, (s.bounds.min.y - s.pan.y) / range));
        const size = Math.max(0.06, view / content);
        thumb.style.height = `${size * 100}%`;
        thumb.style.top = `${progress * (1 - size) * 100}%`;
      };
      p.on("zoomPanUpdate", sync);
      p.on("change", sync);
      p.on("resize", sync);
    },
  });
}

/**
 * Caption and position track, plus a localized name for screen readers (PhotoSwipe's own words are English).
 * PhotoSwipe slides left to right in every language, so its controls are laid out left to right too
 * (right-to-left pages would otherwise mirror the bar but not the arrows and swipes, and read "4 / 1").
 */
export function bindUi(lightbox: PhotoSwipeLightbox, viewerLabel: string): void {
  lightbox.on("uiRegister", () => {
    if (!lightbox.pswp) return;
    lightbox.pswp.element?.setAttribute("dir", "ltr");
    registerCaption(lightbox.pswp);
    registerTrack(lightbox.pswp);
  });
  lightbox.on("afterInit", () => {
    const pswp = lightbox.pswp;
    if (!pswp) return;
    if (viewerLabel) pswp.element?.setAttribute("aria-label", viewerLabel);
    for (const el of [pswp.scrollWrap, ...(pswp.element?.querySelectorAll(".pswp__item") ?? [])]) el?.removeAttribute("aria-roledescription");
  });
}
