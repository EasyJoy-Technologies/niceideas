import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { htmlResponse, pageContext } from "./respond";
import { INFO_LAYOUT, type InfoPage, type InfoSection } from "./info-content";

function section(ctx: ChromeContext, page: InfoPage, s: InfoSection): string {
  const t = (k: string) => escapeHtml(ctx.intl.t(`info.${page}.${k}`, { brand: GLOSSARY.brand }));
  if (s.kind === "p") return `<p>${t(s.key)}</p>`;
  if (s.kind === "list") return `<ul>${s.keys.map((k) => `<li>${t(k)}</li>`).join("")}</ul>`;
  return `<h2>${t(s.q)}</h2><p>${t(s.a)}</p>`;
}

/** About / guidelines / terms / privacy / help, in the share-page style. */
export function renderInfoPage(ctx: ChromeContext, page: InfoPage): string {
  const title = ctx.intl.t(`info.${page}.title`, { brand: GLOSSARY.brand });
  const body = INFO_LAYOUT[page].map((s) => section(ctx, page, s)).join("");
  const main = `<main class="ni-main"><article class="ni-post ni-info"><h1 class="ni-title">${escapeHtml(title)}</h1><div class="ni-text">${body}</div></article></main>`;
  return renderPage(ctx, { title: `${title} · ${GLOSSARY.brand}`, main });
}

/** Route handler of one information page (site page: 451 in mainland China via `src/proxy.ts`). */
export function infoRoute(page: InfoPage) {
  return async (request: Request) => htmlResponse(renderInfoPage(await pageContext(request, "site"), page), 200);
}
