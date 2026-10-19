import { fileTypeFromFile } from "file-type";
import type { MediaKind } from "@/server/db/schema";

export type DetectedType = { kind: MediaKind; mime: string; ext: string };

/** Accepted image types (by real file header). SVG / HEIC / BMP are rejected (plan §6). */
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Accepted audio containers, normalized to a browser-playable MIME.
 * `video/mp4` / `video/webm` are candidates only: the audio probe must confirm there is no video track.
 */
const AUDIO_TYPES: Record<string, { mime: string; ext: string }> = {
  "audio/mpeg": { mime: "audio/mpeg", ext: "mp3" },
  "audio/x-m4a": { mime: "audio/mp4", ext: "m4a" },
  "audio/mp4": { mime: "audio/mp4", ext: "m4a" },
  "video/mp4": { mime: "audio/mp4", ext: "m4a" },
  "audio/aac": { mime: "audio/aac", ext: "aac" },
  "audio/ogg": { mime: "audio/ogg", ext: "ogg" },
  "audio/ogg; codecs=opus": { mime: "audio/ogg", ext: "opus" },
  "audio/opus": { mime: "audio/ogg", ext: "opus" },
  "audio/webm": { mime: "audio/webm", ext: "webm" },
  "video/webm": { mime: "audio/webm", ext: "webm" },
  "audio/wav": { mime: "audio/wav", ext: "wav" },
  "audio/x-wav": { mime: "audio/wav", ext: "wav" },
};

/** Identifies an upload from its bytes; the client-declared type is never trusted. */
export async function detectMediaType(filePath: string): Promise<DetectedType | null> {
  const found = await fileTypeFromFile(filePath);
  if (!found) return null;
  const image = IMAGE_TYPES[found.mime];
  if (image) return { kind: "image", mime: found.mime, ext: image };
  const audio = AUDIO_TYPES[found.mime];
  if (audio) return { kind: "audio", ...audio };
  return null;
}
