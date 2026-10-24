import type PhotoSwipeLightbox from "photoswipe/lightbox";

/**
 * The back button (phones) closes the viewer instead of leaving the page: opening adds a history
 * entry, closing any other way removes it again.
 */
export function bindBackButton(lightbox: PhotoSwipeLightbox): void {
  let pushed = false;
  lightbox.on("beforeOpen", () => {
    history.pushState({ niViewer: true }, "");
    pushed = true;
  });
  addEventListener("popstate", () => {
    if (!pushed) return;
    pushed = false;
    lightbox.pswp?.close();
  });
  lightbox.on("close", () => {
    if (!pushed) return;
    pushed = false;
    history.back();
  });
}
