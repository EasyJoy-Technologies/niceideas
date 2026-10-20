import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { icon, type IconName } from "./icons";

export type StatusKind = "notFound" | "withdrawn" | "removed" | "restricted";

const ICONS: Record<StatusKind, IconName> = { notFound: "missing", withdrawn: "withdrawn", removed: "withdrawn", restricted: "restricted" };

/** 404 / 410 / 451 page in the share-page style; never indexed. */
export function renderStatusPage(ctx: ChromeContext, kind: StatusKind): string {
  const { t } = ctx.intl;
  const title = t(`share.status.${kind}.title`);
  const main =
    `<main class="ni-status"><div class="ni-status-card"><div class="ni-status-icon">${icon(ICONS[kind])}</div>` +
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(t(`share.status.${kind}.body`))}</p></div></main>`;
  return renderPage(ctx, { title, head: '<meta name="robots" content="noindex">', main });
}
