import type { Db } from "@/server/db/client";
import type { Media, PostKind } from "@/server/db/schema";
import { findMediaByIds } from "@/server/db/repos/media";

/** What a quote shows of the post it quotes (feed cards, post page, quote compose box). */
export type QuotedPost = {
  slug: string;
  kind: PostKind;
  title: string;
  summary: string;
  published_at: Date;
  author_handle: string;
  author_name: string;
  author_avatar: string | null;
  cover: Media | null;
};

/**
 * Quoted posts that everyone may see now (live, public, author active), by post id. Ids missing from
 * the result are shown as "no longer available" (private, offline, removed, purged).
 */
export async function loadQuoted(db: Db, ids: string[]): Promise<Map<string, QuotedPost>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .selectFrom("post")
    .innerJoin("profile", "profile.user_id", "post.author_id")
    .select(["post.id", "post.slug", "post.kind", "post.title", "post.summary", "post.published_at", "post.cover_media_id", "profile.handle", "profile.display_name", "profile.avatar_url"])
    .where("post.id", "in", unique)
    .where("post.status", "=", "active")
    .where("post.visibility", "=", "public")
    .where("profile.status", "=", "active")
    .execute();
  const covers = new Map((await findMediaByIds(db, rows.flatMap((r) => (r.cover_media_id ? [r.cover_media_id] : [])))).map((m) => [m.id, m]));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        slug: r.slug, kind: r.kind, title: r.title, summary: r.summary, published_at: r.published_at,
        author_handle: r.handle, author_name: r.display_name, author_avatar: r.avatar_url,
        cover: r.cover_media_id ? covers.get(r.cover_media_id) ?? null : null,
      },
    ]),
  );
}

/** One quoted post by slug (the quote compose box). */
export async function loadQuotedBySlug(db: Db, slug: string): Promise<QuotedPost | null> {
  const row = await db.selectFrom("post").select("id").where("slug", "=", slug).executeTakeFirst();
  return row ? (await loadQuoted(db, [row.id])).get(row.id) ?? null : null;
}
