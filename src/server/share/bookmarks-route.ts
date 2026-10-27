import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { peekVisitorKey } from "@/server/interactions/visitor";
import { renderBookmarksPage } from "./bookmarks-page";
import { loadBookmarks, parseCursor } from "./load-feed";
import { htmlResponse, pageContext } from "./respond";

/** GET /bookmarks (site page; 451 in mainland China via src/proxy.ts): the signed-in user's saved posts. */
export async function bookmarksPage(request: Request): Promise<Response> {
  const ctx = await pageContext(request, "site");
  if (!ctx.viewer) return new Response(null, { status: 303, headers: { Location: "/auth/sign-in?next=%2Fbookmarks", "Cache-Control": "no-store" } });
  try {
    const before = new URL(request.url).searchParams.get("before");
    const page = await loadBookmarks(getDb(), ctx.viewer.user_id, parseCursor(before), peekVisitorKey(request.headers));
    return htmlResponse(renderBookmarksPage(ctx, page, !before), 200);
  } catch (err) {
    console.error(`[share] bookmarks page failed errorId=${randomUUID()}`, err);
    throw err;
  }
}
