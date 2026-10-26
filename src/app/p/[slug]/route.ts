import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { followingAmong } from "@/server/db/repos/follows";
import { postPageVersion } from "@/server/db/repos/posts";
import { peekVisitorKey } from "@/server/interactions/visitor";
import { commentPage, loadPageInteractions } from "@/server/share/load-interactions";
import { loadSharePost } from "@/server/share/load-post";
import { loadPostAside } from "@/server/share/load-post-aside";
import { pageNotice, renderPostPage, renderPreparingPage } from "@/server/share/post-page";
import { cachedPage } from "@/server/share/page-cache";
import { pageContext } from "@/server/share/respond";
import { renderStatusPage } from "@/server/share/status-page";
import { themeParamRedirect } from "@/server/share/theme-param";

/** Public post page (plan §6, §16): 200 / 404 / 410, plain server HTML (briefly cached for anonymous visitors). */
export async function GET(request: Request, ctx: RouteContext<"/p/[slug]">) {
  // Apps opening their user's own post pass `?theme=` (docs/api/nicenote.md).
  const themed = themeParamRedirect(request);
  if (themed) return themed;
  const page = await pageContext(request);
  try {
    const slug = (await ctx.params).slug;
    const db = getDb();
    const url = new URL(request.url);
    return await cachedPage(request, page, async () => {
      // Private posts: their author only; everyone else gets the page of a nonexistent post.
      const result = await loadSharePost(db, slug, page.viewer?.user_id ?? null);
      if (result.state === "not_found") return { html: renderStatusPage(page, "notFound"), status: 404 };
      if (result.state === "gone") return { html: renderStatusPage(page, result.reason), status: 410 };
      if (result.state === "preparing") return { html: renderPreparingPage(page, result.post, result.author), status: 200 };
      const social = await loadPageInteractions(db, result.data.post, peekVisitorKey(request.headers), commentPage(url));
      const authorId = result.data.author.user_id;
      const following = page.viewer ? (await followingAmong(db, page.viewer.user_id, [authorId])).has(authorId) : false;
      const aside = page.restricted ? null : { ...(await loadPostAside(db, result.data.author, result.data.post.id)), following };
      return { html: renderPostPage(page, result.data, social, aside, following, pageNotice(url)), status: 200 };
    }, await postPageVersion(db, slug));
  } catch (err) {
    console.error(`[share] page failed errorId=${randomUUID()}`, err);
    throw err;
  }
}
