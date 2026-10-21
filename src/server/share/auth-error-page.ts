import type { SignInFailure } from "@/server/auth/web/sign-in-flow";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { icon } from "./icons";

/** Sign-in problem page (share-page status style); offers a retry unless sign-in is disabled. */
export function renderAuthErrorPage(ctx: ChromeContext, kind: SignInFailure): string {
  const { t } = ctx.intl;
  const title = t(`auth.error.${kind}.title`);
  const retry = kind === "disabled" || kind === "deleting" ? "" : `<p><a class="ni-btn ni-btn-primary" href="/auth/sign-in">${escapeHtml(t("auth.error.retry"))}</a></p>`;
  const main =
    `<main class="ni-status"><div class="ni-status-card"><div class="ni-status-icon">${icon("restricted")}</div>` +
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(t(`auth.error.${kind}.body`))}</p>${retry}</div></main>`;
  return renderPage(ctx, { title, head: '<meta name="robots" content="noindex">', main });
}
