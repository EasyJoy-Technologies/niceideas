// Share page enhancements (the page is complete without JS): local times,
// image lightbox, share / copy-link button. Labels come from data-* attributes.
(() => {
  const d = document;
  const lang = d.documentElement.lang || undefined;
  const labels = d.body.dataset;

  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  for (const t of d.querySelectorAll("time[datetime]")) {
    const at = new Date(t.getAttribute("datetime"));
    if (!Number.isNaN(at.getTime())) t.textContent = fmt.format(at);
  }

  let box;
  const lightbox = (src, alt) => {
    if (!box) {
      box = d.createElement("dialog");
      box.className = "ni-lb";
      const close = d.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", labels.closeLabel || "");
      close.innerHTML = '<svg class="ni-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      close.addEventListener("click", () => box.close());
      box.append(close, d.createElement("img"));
      box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
      d.body.append(box);
    }
    const img = box.querySelector("img");
    img.src = src;
    img.alt = alt;
    box.showModal();
  };
  if (typeof HTMLDialogElement === "function") {
    for (const a of d.querySelectorAll("a.ni-zoom")) {
      a.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        lightbox(a.href, a.querySelector("img")?.alt || "");
      });
    }
  }

  const toast = (text) => {
    const el = d.createElement("div");
    el.className = "ni-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    d.body.append(el);
    setTimeout(() => el.remove(), 2200);
  };
  const url = d.querySelector('link[rel="canonical"]')?.href || location.href;
  for (const btn of d.querySelectorAll("button.ni-share")) {
    if (!navigator.share && !navigator.clipboard) continue;
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: d.title, url }); } catch { /* dismissed */ }
        return;
      }
      try { await navigator.clipboard.writeText(url); toast(labels.copiedLabel || url); } catch { toast(url); }
    });
  }
})();
