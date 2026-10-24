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
