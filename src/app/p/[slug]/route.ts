import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { followingAmong } from "@/server/db/repos/follows";
import { peekVisitorKey } from "@/server/interactions/visitor";
import { commentPage, loadPageInteractions } from "@/server/share/load-interactions";
import { loadSharePost } from "@/server/share/load-post";
import { loadPostAside } from "@/server/share/load-post-aside";
import { renderPostPage } from "@/server/share/post-page";
import { cachedPage } from "@/server/share/page-cache";
import { pageContext } from "@/server/share/respond";
import { renderStatusPage } from "@/server/share/status-page";

/** Public post page (plan §6, §16): 200 / 404 / 410, plain server HTML (briefly cached for anonymous visitors). */
export async function GET(request: Request, ctx: RouteContext<"/p/[slug]">) {
  const page = await pageContext(request);
  try {
    const slug = (await ctx.params).slug;
    return await cachedPage(request, page, async () => {
      const db = getDb();
      const result = await loadSharePost(db, slug);
      if (result.state === "not_found") return { html: renderStatusPage(page, "notFound"), status: 404 };
      if (result.state === "gone") return { html: renderStatusPage(page, result.reason), status: 410 };
      const social = await loadPageInteractions(db, result.data.post, peekVisitorKey(request.headers), commentPage(new URL(request.url)));
      const authorId = result.data.author.user_id;
      const following = page.viewer ? (await followingAmong(db, page.viewer.user_id, [authorId])).has(authorId) : false;
      const aside = page.restricted ? null : { ...(await loadPostAside(db, result.data.author, result.data.post.id)), following };
      return { html: renderPostPage(page, result.data, social, aside, following), status: 200 };
    });
  } catch (err) {
    console.error(`[share] page failed errorId=${randomUUID()}`, err);
    throw err;
  }
}
