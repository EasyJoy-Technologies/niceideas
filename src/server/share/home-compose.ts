import type { Db } from "@/server/db/client";
import { SLUG_PATTERN } from "@/server/posts/slug";
import type { ChromeContext } from "./chrome";
import { composeBox, composeError } from "./compose-box";
import { loadQuotedBySlug } from "./load-quotes";
import { quoteEmbed } from "./quote-embed";

/**
 * Compose box of the signed-in home timeline. `?quote=<slug>` (a post's repost menu → Quote) opens it
 * quoting that post; a post no longer available shows the "quote_gone" message and a plain box.
 */
export async function homeCompose(ctx: ChromeContext, db: Db, url: URL): Promise<string> {
  const slug = url.searchParams.get("quote");
  if (!slug || !ctx.viewer || ctx.restricted) return composeBox(ctx, composeError(url));
  const quoted = SLUG_PATTERN.test(slug) ? await loadQuotedBySlug(db, slug) : null;
  if (!quoted) return composeBox(ctx, "quote_gone");
  return composeBox(ctx, composeError(url), undefined, { slug, embed: quoteEmbed(ctx, quoted, false) });
}
