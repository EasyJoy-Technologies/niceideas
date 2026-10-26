import { Readable } from "node:stream";
import { sessionProfile } from "@/server/auth/web/session";
import { getDb } from "@/server/db";
import { findMediaByIds } from "@/server/db/repos/media";
import { findPostBySlug } from "@/server/db/repos/posts";
import { listRevisionMediaIds } from "@/server/db/repos/revisions";
import { publicUrl, renditionsOf } from "@/server/media/keys";
import { SLUG_PATTERN } from "@/server/posts/slug";
import { getMediaStores } from "@/server/storage";
import { singleByteRange } from "@/server/storage/range";
import { assertSafeKey, ObjectMissingError, RangeNotSatisfiableError } from "@/server/storage/types";

const NO_STORE = { "Cache-Control": "no-store" };
const notFound = () => new Response(null, { status: 404, headers: NO_STORE });

/** The rendition `key` of a media the post's current revision uses; undefined otherwise. */
async function renditionOfPost(slug: string, key: string, viewerId: string) {
  const db = getDb();
  const post = await findPostBySlug(db, slug);
  if (!post || post.author_id !== viewerId || !post.current_revision_id) return undefined;
  const media = await findMediaByIds(db, await listRevisionMediaIds(db, post.current_revision_id));
  for (const m of media) {
    const r = renditionsOf(m).find((x) => x.key === key);
    if (r) return { media: m, rendition: r };
  }
  return undefined;
}

/**
 * GET /p/{slug}/media/{key}: media of a private post for its author (signed in) only — everyone else gets
 * 404. Read from the private store with single byte ranges (audio seeking); media that are public anyway
 * (also used by a public post) redirect to the public domain. Never stored by shared caches.
 */
export async function ownMediaResponse(request: Request, slug: string, keyParts: string[]): Promise<Response> {
  const key = keyParts.join("/");
  if (!SLUG_PATTERN.test(slug)) return notFound();
  try {
    assertSafeKey(key);
  } catch {
    return notFound();
  }
  const viewer = await sessionProfile(getDb(), request.headers);
  const found = viewer ? await renditionOfPost(slug, key, viewer.user_id) : undefined;
  if (!found) return notFound();
  if (found.media.public_at) return new Response(null, { status: 302, headers: { Location: publicUrl(key), ...NO_STORE } });
  try {
    const obj = await getMediaStores().privateStore.read(key, singleByteRange(request.headers.get("range")));
    const headers = new Headers({
      "Content-Type": found.rendition.mime,
      "Content-Length": String(obj.contentLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    });
    if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
    return new Response(Readable.toWeb(obj.body) as unknown as ReadableStream, { status: obj.contentRange ? 206 : 200, headers });
  } catch (err) {
    if (err instanceof RangeNotSatisfiableError) {
      return new Response(null, { status: 416, headers: { ...NO_STORE, ...(err.size === null ? {} : { "Content-Range": `bytes */${err.size}` }) } });
    }
    // Missing (moved meanwhile, or a failed check): the page shows a broken image, the author can retry.
    if (!(err instanceof ObjectMissingError)) console.error(JSON.stringify({ event: "own_media", result: "error", error: err instanceof Error ? err.message : String(err) }));
    return notFound();
  }
}
