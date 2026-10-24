// Image viewer — design draft for v1.0.65 (becomes src/client/viewer, bundled like compose.js).
// PhotoSwipe 5 (MIT, same-origin, no inline styles). Without JS the image link opens the image.
// Each post body / feed card is one set: swipe or ← → between its images, in page order.
(() => {
  const d = document;
  if (typeof PhotoSwipeLightbox !== "function") return;
  const L = d.body.dataset;
  const icon = (paths) => `<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

  // Long images (at least 3× taller than wide, e.g. long screenshots) open at reading width
  // (the screen on phones, the post column on wide screens), top first; scroll / drag moves down.
  const isLong = (zl) => zl.elementSize.y >= 3 * zl.elementSize.x;
  const COLUMN = 672; // 42rem, the post column
  const initial = (zl) => (isLong(zl) ? Math.max(zl.fit, Math.min(1, Math.min(zl.panAreaSize.x, COLUMN) / zl.elementSize.x)) : zl.fit);

  const lightbox = new PhotoSwipeLightbox({
    gallery: ".ni-body",
    children: "a.ni-zoom",
    pswpModule: PhotoSwipe,
    loop: false,
    bgOpacity: 1,
    // Wide screens: room around the image for the bar, arrows and caption. Phones: edge to edge;
    // long images start below the bar.
    paddingFn: (view, item) => {
      if (view.x >= 768) return { top: 72, bottom: 72, left: 88, right: 88 };
      return { top: item.height >= 3 * item.width ? 64 : 0, bottom: 0, left: 0, right: 0 };
    },
    preloaderDelay: 1000,
    showHideAnimationType: "zoom",
    indexIndicatorSep: " / ",
    closeTitle: L.closeLabel,
    zoomTitle: L.zoomLabel,
    arrowPrevTitle: L.prevLabel,
    arrowNextTitle: L.nextLabel,
    errorMsg: L.imageErrorLabel,
    closeSVG: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    zoomSVG: icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/><path class="ni-pv-plus" d="M11 8v6"/>'),
    arrowPrevSVG: icon('<path d="m15 18-6-6 6-6"/>'),
    arrowNextSVG: icon('<path d="m9 18 6-6-6-6"/>'),
    preloaderSVG: icon('<circle cx="12" cy="12" r="9"/><path d="M21 12a9 9 0 0 0-9-9"/>'),
    initialZoomLevel: initial,
    // Double-tap / click: about 3× (at least 2×, so small images zoom too).
    secondaryZoomLevel: (zl) => Math.max(initial(zl) * 2, isLong(zl) ? 0 : Math.min(1, zl.fit * 3)),
    maxZoomLevel: (zl) => Math.max(1, initial(zl) * 4),
  });

  // Feed thumbnails are square crops: open from the crop.
  lightbox.addFilter("itemData", (item) => {
    if (item.element?.closest(".ni-fc-thumbs")) item.thumbCropped = true;
    return item;
  });

  // Long image: start at the top.
  lightbox.on("initialZoomPan", ({ slide }) => {
    if (isLong(slide.zoomLevels)) slide.pan.y = slide.bounds.min.y; // PhotoSwipe: min = top edge, max = bottom edge
  });

  lightbox.on("uiRegister", () => {
    const pswp = lightbox.pswp;
    pswp.ui.registerElement({
      name: "caption",
      order: 9,
      isButton: false,
      appendTo: "root",
      onInit: (el, p) => {
        el.classList.add("ni-pv-caption");
        const text = d.createElement("p");
        el.append(text);
        p.on("change", () => {
          const a = p.currSlide?.data.element;
          const caption = a?.closest("figure")?.querySelector("figcaption")?.textContent || a?.querySelector("img")?.alt || "";
          text.textContent = caption;
          el.hidden = !caption;
        });
      },
    });
    pswp.ui.registerElement({
      name: "track",
      order: 10,
      isButton: false,
      appendTo: "root",
      onInit: (el, p) => {
        el.classList.add("ni-pv-track");
        const thumb = d.createElement("span");
        thumb.className = "ni-pv-thumb";
        el.append(thumb);
        const sync = () => {
          const s = p.currSlide;
          if (!s) return;
          const view = s.panAreaSize.y;
          const content = s.height * s.currZoomLevel;
          el.hidden = !(content > view * 1.5);
          // Moved down a long image: the caption steps aside.
          p.element.classList.toggle("ni-pv-scrolled", isLong(s.zoomLevels) && s.pan.y < s.bounds.min.y - 24);
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
  });

  // Mouse wheel: zooms photos, scrolls long images (trackpad pinch zooms both).
  lightbox.on("change", () => {
    const p = lightbox.pswp;
    const item = p.currSlide?.data;
    p.options.wheelToZoom = !(item && item.height >= 3 * item.width);
  });

  // Labels the screen reader hears (PhotoSwipe's own are English).
  lightbox.on("afterInit", () => {
    const p = lightbox.pswp;
    p.element.setAttribute("aria-label", L.viewerLabel || "");
    p.scrollWrap.setAttribute("aria-roledescription", L.viewerLabel || "");
  });

  // The back button (phones) closes the viewer instead of leaving the page.
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

  lightbox.init();
  window.__viewer = lightbox; // design draft only: lets the screenshot script drive it
})();
