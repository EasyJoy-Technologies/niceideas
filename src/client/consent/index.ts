import { Banner, type BannerAction } from "./banner";
import { needsPrompt, readChoice, writeChoice, type Grants } from "./store";
import { loadGranted, withdraw } from "./vendors";

/**
 * Cookie consent (/scripts/consent.js, on pages that offer optional cookies; markup and request
 * version: src/server/share/consent.ts). Nothing optional loads before the visitor grants its
 * category. The banner asks again when a new category is offered (earlier grants keep working) or
 * the request version rises (earlier grants no longer count). Withdrawing a category deletes its
 * cookies and reloads the page so the tools are gone.
 */
function setup(): void {
  const root = document.getElementById("ni-consent");
  if (!root) return;
  const banner = new Banner(root);
  const { offered, version } = banner;
  let current = readChoice();

  const decide = (action: BannerAction) => {
    const picked = banner.checked();
    const grants: Grants = {};
    for (const c of offered) grants[c] = action === "accept" || (action === "save" && !!picked[c]);
    const withdrawn = offered.filter((c) => current?.grants[c] && !grants[c]);
    current = { version, grants };
    writeChoice(current);
    banner.hide();
    if (withdrawn.length === 0) return loadGranted(grants);
    withdraw(grants, withdrawn);
    location.reload();
  };
  banner.onAction(decide);

  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-consent-open]")) {
    b.hidden = false;
    b.addEventListener("click", () => banner.show(current?.grants ?? {}, true));
  }

  if (current && current.version >= version) loadGranted(current.grants);
  if (needsPrompt(current, version, offered)) banner.show(current?.grants ?? {}, false);
}

setup();
