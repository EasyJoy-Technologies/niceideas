import type { Media } from "@/server/db/schema";

export type MediaDto = {
  id: string;
  kind: Media["kind"];
  mime: string;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export function toMediaDto(m: Media): MediaDto {
  return { id: m.id, kind: m.kind, mime: m.mime, sha256: m.sha256, width: m.width, height: m.height, durationMs: m.duration_ms };
}
