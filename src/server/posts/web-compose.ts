import { randomUUID } from "node:crypto";
import type { Principal } from "@/server/auth/principal";
import type { Db } from "@/server/db/client";
import type { Post } from "@/server/db/schema";
import { documentPlainText, SHORT_MAX_CHARS } from "@/server/documents/derive";
import type { DocBlock, PostDocument } from "@/server/documents/schema";
import { parseDocument } from "@/server/documents/validate";
import { badRequest } from "@/server/http/errors";
import { ingestUpload, type MediaLimits } from "@/server/media/ingest";
import { mediaLimitsFromConfig } from "@/server/media/limits";
import type { MediaStores } from "@/server/storage/types";
import { removeTempDir, spoolBody } from "@/server/util/temp-file";
import { createPost } from "./create-post";
import { assertCanUploadMedia } from "./rate-limit";
import { editorBlocks, type DraftBlock, type DraftMeta } from "./web-compose-doc";

/** Web compose limits (the API allows more; the form keeps posts light). */
export const WEB_MAX_IMAGES = 10;
export const WEB_MAX_AUDIOS = 10;
export const WEB_MAX_TEXT = 20_000;

/** "short": short post (≤ SHORT_MAX_CHARS, media under the text); "long": article. null: derived (older form). */
export type ComposeMode = "short" | "long";
export type WebComposeInput = { mode: ComposeMode | null; title: string; blocks: DraftBlock[]; files: File[] };

const filesOf = (form: FormData, name: string) => form.getAll(name).filter((f): f is File => typeof f !== "string" && f.size > 0);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads the compose / edit form. With JS: `doc` (editor JSON) + `media` files referenced by index.
 * Without JS: `text` (plain; Markdown when `format=markdown`, the edit page), the post's kept media
 * (`keep_image` / `keep_audio` ids, edit page), then `images`, then `audios`.
 */
export function readComposeForm(form: FormData): WebComposeInput {
  const m = String(form.get("mode") ?? "");
  const mode: ComposeMode | null = m === "short" || m === "long" ? m : null;
  const title = mode === "short" ? "" : String(form.get("title") ?? "").trim();
  const doc = form.get("doc");
  if (typeof doc === "string" && doc) return { mode, title, blocks: editorBlocks(doc), files: filesOf(form, "media") };
  const images = filesOf(form, "images");
  const audios = filesOf(form, "audios");
  const text = String(form.get("text") ?? "").trim();
  const format = form.get("format") === "markdown" ? "markdown" : "plain";
  const blocks: DraftBlock[] = text ? [{ type: "text", format, text }] : [];
  for (const kind of ["image", "audio"] as const) {
    for (const id of form.getAll(`keep_${kind}`)) if (typeof id === "string" && UUID.test(id)) blocks.push({ type: "stored", kind, mediaId: id, meta: {} });
  }
  images.forEach((_, i) => blocks.push({ type: "media", kind: "image", file: i }));
  audios.forEach((_, i) => blocks.push({ type: "media", kind: "audio", file: images.length + i }));
  return { mode, title, blocks, files: [...images, ...audios] };
}

const isMedia = (b: DraftBlock) => b.type === "media" || b.type === "stored";

/** Rejects empty / oversized drafts before any upload is processed. */
export function checkDraft(input: WebComposeInput): void {
  const media = input.blocks.filter(isMedia) as Extract<DraftBlock, { kind: string }>[];
  const text = input.blocks.filter((b) => !isMedia(b)) as DocBlock[];
  if (text.length === 0 && media.length === 0) throw badRequest("compose.empty");
  const files = media.flatMap((b) => (b.type === "media" ? [b.file] : []));
  if (files.some((f) => f >= input.files.length) || new Set(files).size !== files.length) throw badRequest("compose.invalid");
  const images = media.filter((b) => b.kind === "image").length;
  if (images > WEB_MAX_IMAGES || media.length - images > WEB_MAX_AUDIOS) throw badRequest("compose.too_much");
  const plain = documentPlainText({ version: 1, blocks: text } as PostDocument);
  if (plain.length > WEB_MAX_TEXT) throw badRequest("compose.too_much");
  if (input.mode === "short" && Array.from(plain).length > SHORT_MAX_CHARS) throw badRequest("compose.short_too_long");
}

async function ingestFile(db: Db, stores: MediaStores, userId: string, file: File, limits: MediaLimits) {
  await assertCanUploadMedia(db, userId);
  const upload = await spoolBody(file.stream(), Math.max(limits.maxImageBytes, limits.maxAudioBytes));
  try {
    return (await ingestUpload(db, stores.privateStore, { ownerId: userId, upload, declaredSha256: upload.sha256, limits })).media;
  } finally {
    await removeTempDir(upload.dir);
  }
}

/**
 * Draft → API document: uploads new files in order (each becomes a media block in place); stored
 * media keep their id and details (`metaOf` fills details the form did not send).
 */
export async function draftDocument(db: Db, stores: MediaStores, userId: string, input: WebComposeInput, metaOf: (id: string) => DraftMeta = () => ({})): Promise<PostDocument> {
  checkDraft(input);
  const limits = mediaLimitsFromConfig();
  const blocks: DocBlock[] = [];
  for (const b of input.blocks) {
    if (b.type === "stored") {
      const meta = Object.keys(b.meta).length ? b.meta : metaOf(b.mediaId);
      blocks.push(b.kind === "image" ? { type: "image", mediaId: b.mediaId, alt: meta.alt, caption: meta.caption } : { type: "audio", mediaId: b.mediaId, title: meta.title });
      continue;
    }
    if (b.type !== "media") {
      blocks.push(b);
      continue;
    }
    const media = await ingestFile(db, stores, userId, input.files[b.file], limits);
    if (media.kind !== b.kind) throw badRequest("compose.media_mismatch");
    blocks.push(b.kind === "image" ? { type: "image", mediaId: media.id } : { type: "audio", mediaId: media.id });
  }
  return parseDocument({ version: 1, ...(input.title ? { title: input.title } : {}), blocks });
}

/** Publishes a web post (source `web`, no badge) with media in place; the chosen mode sets the kind. */
export async function publishFromWeb(db: Db, stores: MediaStores, userId: string, input: WebComposeInput, cacheControl: string): Promise<Post> {
  if (input.blocks.some((b) => b.type === "stored")) throw badRequest("compose.invalid");
  const document = await draftDocument(db, stores, userId, input);
  const principal: Principal = { userId, clientId: "web", kind: "first_party", source: "web" };
  const kind = input.mode === "short" ? "short" : input.mode === "long" ? "article" : undefined;
  const result = await createPost(db, stores, principal, { document, sourceRef: `web-${randomUUID()}`, sourceUpdatedAt: null, kind }, cacheControl);
  return result.post;
}
