import { GLOSSARY } from "@/i18n/glossary";
import { isLegalDoc, LEGAL_EFFECTIVE_DATE, loadLegalDocument, type LegalDoc } from "@/server/legal/legal-docs";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { infoFooter, infoHeader } from "./info-chrome";
import { htmlResponse, pageContext } from "./respond";
import { INFO_LAYOUT, type InfoPage, type InfoSection } from "./info-content";

function section(ctx: ChromeContext, page: InfoPage, s: InfoSection): string {
  const t = (k: string) => escapeHtml(ctx.intl.t(`info.${page}.${k}`, { brand: GLOSSARY.brand }));
  if (s.kind === "p") return `<p>${t(s.key)}</p>`;
  if (s.kind === "list") return `<ul>${s.keys.map((k) => `<li>${t(k)}</li>`).join("")}</ul>`;
  return `<h2>${t(s.q)}</h2><p>${t(s.a)}</p>`;
}

/** Terms / privacy: effective date (plain text: share.js rewrites every <time datetime>), summary, table of contents (wide: side column; phones: drop-down), sections. */
function legalBody(ctx: ChromeContext, page: LegalDoc, title: string): string {
  const { t, locale } = ctx.intl;
  const doc = loadLegalDocument(page, locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`));
  const links = doc.sections.map((s) => `<li><a href="#${s.id}">${escapeHtml(s.title)}</a></li>`).join("");
  const tocLabel = escapeHtml(t("info.toc"));
  const sections = doc.sections.map((s) => `<section id="${s.id}"><h2>${escapeHtml(s.title)}</h2>${s.html}</section>`).join("");
  return (
    `<div class="ni-info-wrap ni-has-toc"><nav class="ni-toc" aria-label="${tocLabel}"><div class="ni-toc-h">${tocLabel}</div><ol>${links}</ol></nav>` +
    `<main class="ni-info-main"><article class="ni-post ni-info ni-legal"><h1 class="ni-title">${escapeHtml(title)}</h1>` +
    `<div class="ni-legal-meta"><span class="ni-pill">${escapeHtml(t("info.effective", { date }))}</span></div>` +
    `<div class="ni-legal-sum">${doc.summaryHtml}</div>` +
    `<details class="ni-toc-m"><summary>${tocLabel}</summary><ol>${links}</ol></details>` +
    `<div class="ni-text">${sections}</div></article></main></div>`
  );
}

/** About / guidelines / terms / privacy / help, with the information-page chrome. */
export function renderInfoPage(ctx: ChromeContext, page: InfoPage): string {
  const title = ctx.intl.t(`info.${page}.title`, { brand: GLOSSARY.brand });
  const main = isLegalDoc(page)
    ? legalBody(ctx, page, title)
    : `<div class="ni-info-wrap"><main class="ni-info-main"><article class="ni-post ni-info"><h1 class="ni-title">${escapeHtml(title)}</h1>` +
      `<div class="ni-text">${INFO_LAYOUT[page].map((s) => section(ctx, page, s)).join("")}</div></article></main></div>`;
  return renderPage(ctx, { title: `${title} · ${GLOSSARY.brand}`, main, header: infoHeader(ctx), footer: infoFooter(ctx), stylesheets: ["/styles/info.css"] });
}

/** Route handler of one information page (site page: 451 in mainland China via `src/proxy.ts`). */
export function infoRoute(page: InfoPage) {
  return async (request: Request) => htmlResponse(renderInfoPage(await pageContext(request, "site"), page), 200);
}
