// Admin console enhancements (the console is complete without JS). Bulk bar on the posts / comments lists
// (server/admin-ui/bulk-bar.ts): select all on this page, the count, the apply button's label, colour and
// disabled state, and the visibility target only for "narrow visibility". Texts come from data-* templates.
(() => {
  const bar = document.getElementById("ad-bulk");
  if (!bar) return;
  const boxes = [...document.querySelectorAll('input[name="targets"][form="ad-bulk"]')];
  const all = bar.querySelector("[data-bulk-all]");
  const allLabel = all.closest("label");
  const allText = allLabel.querySelector("span");
  const op = bar.querySelector('select[name="op"]');
  const vis = bar.querySelector("[data-bulk-vis]");
  const apply = bar.querySelector("[data-bulk-apply]");
  const clear = bar.querySelector("[data-bulk-clear]");
  const danger = (bar.dataset.danger || "").split(" ");
  const fill = (template, n) => template.replace("{count}", String(n));

  const update = () => {
    const n = boxes.filter((b) => b.checked).length;
    all.checked = n > 0 && n === boxes.length;
    all.indeterminate = n > 0 && n < boxes.length;
    all.setAttribute("aria-label", bar.dataset.none);
    allText.textContent = n ? fill(bar.dataset.selected, n) : bar.dataset.none;
    apply.disabled = n === 0;
    apply.textContent = n ? fill(bar.dataset.applyN, n) : bar.dataset.apply;
    const red = danger.includes(op.value);
    apply.classList.toggle("ad-btn-danger", red);
    apply.classList.toggle("ni-btn-primary", !red);
    if (vis) vis.hidden = op.value !== "set-visibility";
    clear.hidden = n === 0;
  };

  allLabel.hidden = false;
  all.addEventListener("change", () => {
    for (const b of boxes) b.checked = all.checked;
    update();
  });
  clear.addEventListener("click", () => {
    for (const b of boxes) b.checked = false;
    update();
  });
  for (const b of boxes) b.addEventListener("change", update);
  op.addEventListener("change", update);
  // Nothing selected: stay on the page (the server would answer "failed").
  bar.addEventListener("submit", (e) => {
    if (!boxes.some((b) => b.checked)) e.preventDefault();
  });
  update();
})();
