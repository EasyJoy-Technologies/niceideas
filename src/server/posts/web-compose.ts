import { randomUUID } from "node:crypto";
import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import type { DocBlock } from "@/server/documents/schema";
import { parseDocument } from "@/server/documents/validate";
import { badRequest } from "@/server/http/errors";
import { ingestUpload } from "@/server/media/ingest";
import { mediaLimitsFromConfig } from "@/server/media/limits";
import type { MediaStores } from "@/server/storage/types";
import { removeTempDir, spoolBody } from "@/server/util/temp-file";
import { createPost } from "./create-post";
import { assertCanUploadMedia } from "./rate-limit";

/** Web compose limits (the API allows more; the form keeps posts light). */
export const WEB_MAX_IMAGES = 10;
export const WEB_MAX_TEXT = 20_000;

export type WebComposeInput = { title: string; text: string; images: File[] };

/** Reads the compose form; ignores empty file inputs. */
export function readComposeForm(form: FormData): WebComposeInput {
  const images = form.getAll("images").filter((f): f is File => typeof f !== "string" && f.size > 0);
  return { title: String(form.get("title") ?? "").trim(), text: String(form.get("text") ?? "").trim(), images };
}

/** Publishes a web post (source `web`, no badge): text, then images; a title makes it an article. */
export async function publishFromWeb(db: Db, stores: MediaStores, userId: string, input: WebComposeInput, cacheControl: string): Promise<Post> {
  if (!input.text && input.images.length === 0) throw badRequest("compose.empty");
  if (input.images.length > WEB_MAX_IMAGES || input.text.length > WEB_MAX_TEXT) throw badRequest("compose.too_much");
  const blocks: DocBlock[] = [];
  if (input.text) blocks.push({ type: "text", format: "plain", text: input.text });
  const limits = mediaLimitsFromConfig();
  for (const file of input.images) {
    await assertCanUploadMedia(db, userId);
    const upload = await spoolBody(file.stream(), limits.maxImageBytes);
    try {
      const { media } = await ingestUpload(db, stores.privateStore, { ownerId: userId, upload, declaredSha256: upload.sha256, limits });
      if (media.kind !== "image") throw badRequest("compose.images_only");
      blocks.push({ type: "image", mediaId: media.id });
    } finally {
      await removeTempDir(upload.dir);
    }
  }
  const document = parseDocument({ version: 1, ...(input.title ? { title: input.title } : {}), blocks });
  const principal: Principal = { userId, clientId: "web", kind: "first_party", source: "web" };
  const result = await createPost(db, stores, principal, { document, sourceRef: `web-${randomUUID()}`, sourceUpdatedAt: null }, cacheControl);
  return result.post;
}
