import { Readable } from "node:stream";
import { getConfig } from "@/server/config/env";
import { jsonError } from "@/server/http/json";
import { getMediaStores } from "@/server/storage";
import { assertSafeKey } from "@/server/storage/types";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", webm: "audio/webm", wav: "audio/wav" };

/**
 * Development-only stand-in for the public media domain (local storage driver).
 * Staging / production serve media from the R2 public bucket instead.
 */
export async function GET(_request: Request, ctx: RouteContext<"/media-local/[...key]">) {
  const cfg = getConfig();
  if (cfg.STORAGE_DRIVER !== "local" || cfg.APP_ENV === "production" || cfg.APP_ENV === "staging") {
    return jsonError("route.not_found", 404);
  }
  const key = (await ctx.params).key.join("/");
  try {
    assertSafeKey(key);
    const stream = await getMediaStores().publicStore.getStream(key);
    const type = TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return jsonError("media.not_found", 404);
  }
}
