import { parseFile } from "music-metadata";

export class AudioRejectedError extends Error {}

/** Validates an audio upload and returns its duration. Video tracks are refused. */
export async function probeAudio(filePath: string, maxSeconds: number): Promise<{ durationMs: number }> {
  let meta;
  try {
    meta = await parseFile(filePath, { duration: true, skipCovers: true });
  } catch {
    throw new AudioRejectedError("unparseable");
  }
  if (meta.format.hasVideo) throw new AudioRejectedError("has video");
  if (meta.format.hasAudio === false) throw new AudioRejectedError("no audio");
  const seconds = meta.format.duration;
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) throw new AudioRejectedError("no duration");
  if (seconds > maxSeconds) throw new AudioRejectedError("too long");
  return { durationMs: Math.round(seconds * 1000) };
}
