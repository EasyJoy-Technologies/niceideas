import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon } from "./icons";

/** Search box (GET /search?q=): right column on wide screens, top of the search page elsewhere. */
export function searchBox(ctx: ChromeContext, query = "", cls = "ni-search"): string {
  if (ctx.restricted) return "";
  const label = escapeHtml(ctx.intl.t("search.placeholder", { brand: GLOSSARY.brand }));
  return (
    `<form class="${cls}" role="search" method="get" action="/search">${icon("search")}` +
    `<input type="search" name="q" value="${escapeHtml(query)}" placeholder="${label}" aria-label="${label}" maxlength="100" autocomplete="off"></form>`
  );
}

/**
 * Header search button: opens a search field in a row under the header (no JS: <details>;
 * /scripts/share.js focuses the field and closes it on "Cancel", Esc or a click outside).
 */
export function headerSearch(ctx: ChromeContext): string {
  if (ctx.restricted) return "";
  const { t } = ctx.intl;
  const label = escapeHtml(t("search.title"));
  const placeholder = escapeHtml(t("search.placeholder", { brand: GLOSSARY.brand }));
  return (
    `<details class="ni-hdr-find"><summary class="ni-hdr-nav" aria-label="${label}" title="${label}">${icon("search")}</summary>` +
    `<form class="ni-find" role="search" method="get" action="/search"><div class="ni-search">${icon("search")}` +
    `<input type="search" name="q" placeholder="${placeholder}" aria-label="${placeholder}" maxlength="100" autocomplete="off"></div>` +
    `<button type="button" class="ni-link ni-find-x" data-close>${escapeHtml(t("share.action.cancel"))}</button></form></details>`
  );
}
