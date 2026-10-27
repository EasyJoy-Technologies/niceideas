// Share page enhancements (the page is complete without JS): local times, pop-up
// menus, share / copy-link button. Labels come from data-* attributes. Images: /scripts/viewer.js.
(() => {
  const d = document;
  const lang = d.documentElement.lang || undefined;
  const labels = d.body.dataset;

  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const day = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
  const rel = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  // `data-rel` times read "5 minutes ago" for the first week, then a date.
  const relative = (at) => {
    const s = Math.round((at.getTime() - Date.now()) / 1000);
    const a = Math.abs(s);
    if (a < 45) return rel.format(0, "second");
    if (a < 3600) return rel.format(Math.round(s / 60), "minute");
    if (a < 86400) return rel.format(Math.round(s / 3600), "hour");
    if (a < 7 * 86400) return rel.format(Math.round(s / 86400), "day");
    return day.format(at);
  };
  for (const t of d.querySelectorAll("time[datetime]")) {
    const at = new Date(t.getAttribute("datetime"));
    if (Number.isNaN(at.getTime())) continue;
    t.textContent = t.hasAttribute("data-rel") ? relative(at) : fmt.format(at);
    t.title = fmt.format(at);
  }

  // Pop-up menus (<details>: language, account): a click outside or Esc closes them.
  const MENUS = "details.ni-lang, details.ni-menu, details.ni-hdr-find";
  const closeMenus = (except) => {
    for (const m of d.querySelectorAll(MENUS)) if (m.open && m !== except) m.open = false;
  };
  d.addEventListener("click", (e) => closeMenus(e.target.closest?.(MENUS)));
  d.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(null); });
  // Header search: focus the field when it opens; "Cancel" closes it.
  for (const find of d.querySelectorAll("details.ni-hdr-find")) {
    find.addEventListener("toggle", () => { if (find.open) find.querySelector("input")?.focus(); });
    find.querySelector("[data-close]")?.addEventListener("click", () => { find.open = false; });
  }

  // Phone footer links sit edge to edge in one row; when they do not fit (long languages) they
  // form two rows of two, each edge to edge (class ni-ftr-2 shows a line break after the second
  // link; phones only). Without JS they simply wrap.
  for (const nav of d.querySelectorAll("nav.ni-ftr-links")) {
    const links = [...nav.querySelectorAll("a")];
    if (links.length !== 4) continue;
    const br = d.createElement("span");
    br.className = "ni-ftr-br";
    links[1].after(br);
    const fit = () => {
      if (!nav.clientWidth) return;
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const need = links.reduce((sum, a) => sum + a.getBoundingClientRect().width, 0) + gap * (links.length - 1);
      nav.classList.toggle("ni-ftr-2", need > nav.clientWidth + 0.5);
    };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(nav);
  }

  // Short feed cards (data-href) open their post when tapped anywhere outside links, buttons, form
  // fields, menus and media; a text selection is left alone; Ctrl/⌘/Shift or the middle button
  // open a new tab. Without JS the time link leads there. The class turns on the hover state (feed.css).
  const INTERACTIVE = "a, button, input, textarea, select, label, summary, details, audio, video, dialog";
  const cardTarget = (e) => {
    const card = e.target.closest?.("article.ni-fc[data-href]");
    if (!card || e.target.closest(INTERACTIVE)) return null;
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed && card.contains(sel.anchorNode)) return null;
    return card.dataset.href;
  };
  for (const card of d.querySelectorAll("article.ni-fc[data-href]")) card.classList.add("ni-fc-link");
  // Capture phase: runs before the outside-click handler above, so a tap that only closes an open menu stays a tap.
  d.addEventListener("click", (e) => {
    if (e.button !== 0 || [...d.querySelectorAll(MENUS)].some((m) => m.open)) return;
    const href = cardTarget(e);
    if (!href) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) window.open(href, "_blank", "noopener");
    else location.assign(href);
  }, true);
  d.addEventListener("auxclick", (e) => {
    const href = e.button === 1 ? cardTarget(e) : null;
    if (href) window.open(href, "_blank", "noopener");
  });

  const toast = (text) => {
    const el = d.createElement("div");
    el.className = "ni-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    d.body.append(el);
    setTimeout(() => el.remove(), 2200);
  };
  const pageUrl = d.querySelector('link[rel="canonical"]')?.href || location.href;
  for (const btn of d.querySelectorAll("button.ni-share")) {
    if (!navigator.share && !navigator.clipboard) continue;
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      // Feed cards share their own post; the post page shares itself.
      const url = btn.dataset.url ? new URL(btn.dataset.url, location.origin).href : pageUrl;
      if (navigator.share) {
        try { await navigator.share(btn.dataset.url ? { url } : { title: d.title, url }); } catch { /* dismissed */ }
        return;
      }
      try { await navigator.clipboard.writeText(url); toast(labels.copiedLabel || url); } catch { toast(url); }
    });
  }
})();
