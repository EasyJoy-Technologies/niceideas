import { GLOSSARY } from "@/i18n/glossary";
import type { EditBlocker } from "@/server/posts/edit-post";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { composeBox, type ComposeEdit, type ComposeError } from "./compose-box";
import { renderPage } from "./document";

/**
 * Edit page (/p/{slug}/edit, design docs/design/mockups/edit/): heading "Edit post" with Cancel, then
 * the compose box opened with the post's content. When the post cannot be edited: the reason only.
 */
export function renderEditPage(ctx: ChromeContext, slug: string, edit: ComposeEdit | null, blocker: EditBlocker | null, error: ComposeError | null): string {
  const { t } = ctx.intl;
  const title = t("compose.edit.title");
  const cancel = `<a class="ni-btn ni-btn-ghost ni-btn-sm" href="/p/${escapeHtml(slug)}">${escapeHtml(t("share.action.cancel"))}</a>`;
  const body = edit ? composeBox(ctx, error, edit) : `<p class="ni-card ni-note">${escapeHtml(t(`compose.edit.blocked.${blocker ?? "not_active"}`))}</p>`;
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main: `<main class="ni-main ni-feed-main ni-edit-main"><div class="ni-feed-h"><h1>${escapeHtml(title)}</h1>${cancel}</div>${body}</main>`,
    side: true,
    tabBar: false,
    stylesheets: edit ? ["/styles/compose.css"] : [],
    scripts: edit ? ["/scripts/compose.js"] : [],
  });
}
