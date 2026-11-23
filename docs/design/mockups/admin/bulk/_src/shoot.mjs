import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell", args: ["--no-proxy-server"] });
const OUT = "/root/openclaw/workspace/niceideas/review/bulk-admin";
const pages = (process.env.PAGES || "posts-narrow,posts-remove,posts-idle,comments-hide,orig-posts").split(",");
for (const lang of ["zh", "en"]) for (const p of pages) for (const [tag, w, h] of [["d", 1280, 900], ["m", 390, 844]]) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: tag === "m" ? 2 : 1 });
  await page.goto(`http://127.0.0.1:18932/${p}-${lang}.html`);
  await page.waitForTimeout(300);
  if (tag === "m") {
    // Phone: scroll so the first selected row and the sticky bar are both on screen.
    await page.evaluate(() => { const r = document.querySelector("tr.ad-sel") || document.querySelector(".ad-tbl"); window.scrollTo(0, r.getBoundingClientRect().top + scrollY - 120); });
    await page.screenshot({ path: `${OUT}/${p}-${lang}-m.png` });
  } else await page.screenshot({ path: `${OUT}/${p}-${lang}-d.png`, fullPage: false });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > w) console.log("overflow", p, lang, tag, sw);
  await page.close();
}
await b.close();
console.log("done");
