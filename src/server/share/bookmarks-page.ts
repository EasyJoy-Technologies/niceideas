import { GLOSSARY } from "@/i18n/glossary";
import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { renderPage } from "./document";
import { feedList } from "./feed-list";
import type { FeedPage } from "./load-feed";

/** The signed-in user's saved posts (private: only they see this page), most recently saved first. */
export function renderBookmarksPage(ctx: ChromeContext, page: FeedPage, first: boolean): string {
  const { t } = ctx.intl;
  const title = t("bookmarks.title");
  const empty = first && page.items.length === 0 ? `<p class="ni-card ni-feed-empty">${escapeHtml(t("bookmarks.empty"))}</p>` : "";
  return renderPage(ctx, {
    title: `${title} · ${GLOSSARY.brand}`,
    head: '<meta name="robots" content="noindex">',
    main: `<main class="ni-main ni-feed-main"><div class="ni-feed-h"><h1>${escapeHtml(title)}</h1></div>${empty || feedList(ctx, page, "/bookmarks", "all")}</main>`,
    side: true,
  });
}
