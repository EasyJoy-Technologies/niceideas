import path from "node:path";
import { stat } from "node:fs/promises";
import { getConfig } from "@/server/config/env";
import { runTool, ToolError } from "./run-tool";

export type AudioRejectReason = "unsupported_format" | "decode_failed" | "transcode_failed";

export class AudioUnusableError extends Error {
  constructor(
    readonly reason: AudioRejectReason,
    detail: string,
  ) {
    super(detail);
  }
}

export type WebAudio = { file: string; mime: "audio/mp4" | "audio/mpeg"; ext: "m4a" | "mp3"; bytes: number; durationMs: number | null };

type Probe = { format: string; durationMs: number | null; codec: string; channels: number; tags: Record<string, string> };

const PROBE_TIMEOUT_MS = 60_000;
/** Generous: a 2 GiB WAV is a few hours of audio; AAC encoding runs far faster than real time. */
const FFMPEG_TIMEOUT_MS = 60 * 60_000;
const MP4_FAMILY = /(^|,)(mov|mp4|m4a|3gp|3g2|mj2)(,|$)/;

async function probe(file: string, signal?: AbortSignal): Promise<Probe> {
  let out: string;
  try {
    out = await runTool(
      getConfig().FFPROBE_PATH,
      ["-v", "error", "-show_entries", "format=format_name,duration:format_tags:stream=codec_type,codec_name,channels:stream_tags:stream_disposition=attached_pic", "-of", "json", file],
      { timeoutMs: PROBE_TIMEOUT_MS, signal },
    );
  } catch (err) {
    if (err instanceof ToolError && err.code !== null) throw new AudioUnusableError("unsupported_format", "not a media file");
    throw err;
  }
  const json = JSON.parse(out) as {
    format?: { format_name?: string; duration?: string; tags?: Record<string, string> };
    streams?: { codec_type?: string; codec_name?: string; channels?: number; tags?: Record<string, string>; disposition?: { attached_pic?: number } }[];
  };
  const streams = json.streams ?? [];
  // Cover art is a video stream flagged attached_pic; anything else visual means it is a video.
  if (streams.some((s) => s.codec_type === "video" && !s.disposition?.attached_pic)) throw new AudioUnusableError("unsupported_format", "has video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!audio?.codec_name) throw new AudioUnusableError("unsupported_format", "no audio");
  const seconds = Number(json.format?.duration);
  // Ogg / FLAC keep their tags on the stream, the other containers on the file.
  const tags = keptTags({ ...audio.tags, ...json.format?.tags });
  return { format: json.format?.format_name ?? "", durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null, codec: audio.codec_name, channels: audio.channels ?? 2, tags };
}

/**
 * Tags a published audio file keeps (F21, decided 2026-10-26): what a player shows. Everything else
 * (location, device, software, cover art, chapters, private frames, …) is dropped from every output.
 * Keys as ffprobe reports them (any case) → ffmpeg's generic names.
 */
const KEPT_TAGS: Record<string, string> = {
  title: "title", artist: "artist", album: "album", album_artist: "album_artist", albumartist: "album_artist",
  track: "track", tracknumber: "track", disc: "disc", discnumber: "disc", date: "date", year: "date",
  genre: "genre", composer: "composer", comment: "comment",
};
const MAX_TAG_CHARS = 500;

function keptTags(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const name = KEPT_TAGS[k.toLowerCase()];
    // Control characters (except tab / newline) are dropped.
    const value = Array.from(String(v)).filter((c) => { const n = c.codePointAt(0)!; return n === 9 || n === 10 || (n >= 32 && n !== 127); }).join("").trim().slice(0, MAX_TAG_CHARS);
    if (name && value && !(name in out)) out[name] = value;
  }
  return out;
}

/**
 * Arguments shared by every output: first audio stream only (no video, cover art, subtitles, data or
 * chapters); only the kept tags, no encoder tag.
 */
const INPUT = (file: string, tags: Record<string, string>) => [
  "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", file,
  "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact",
  ...Object.entries(tags).flatMap(([k, v]) => ["-metadata", `${k}=${v}`]),
];

async function ffmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  await runTool(getConfig().FFMPEG_PATH, args, { timeoutMs: FFMPEG_TIMEOUT_MS, signal });
}

/**
 * Makes a browser-playable copy of any audio file (contract §7): MP3 and AAC are only re-wrapped (MP3
 * as MP3, AAC into an M4A with the index first; no re-encoding); everything else is encoded to
 * ~128 kbps AAC / M4A. Only the kept tags survive. Video files and files without audio are refused.
 * No duration limit.
 */
export async function toWebAudio(input: string, workDir: string, signal?: AbortSignal): Promise<WebAudio> {
  const p = await probe(input, signal);
  const m4a = path.join(workDir, "audio.m4a");
  const mp3 = path.join(workDir, "audio.mp3");
  const attempts: { args: string[]; out: string; mime: WebAudio["mime"]; ext: WebAudio["ext"] }[] = [];
  if (p.codec === "mp3" && p.format === "mp3") {
    attempts.push({ args: [...INPUT(input, p.tags), "-c:a", "copy", "-id3v2_version", "3", "-write_id3v1", "0", "-f", "mp3", mp3], out: mp3, mime: "audio/mpeg", ext: "mp3" });
  }
  if (p.codec === "aac" && (MP4_FAMILY.test(p.format) || p.format === "aac")) {
    attempts.push({ args: [...INPUT(input, p.tags), "-c:a", "copy", "-movflags", "+faststart", "-f", "mp4", m4a], out: m4a, mime: "audio/mp4", ext: "m4a" });
  }
  // Re-encoding is also the fallback when copying the stream fails (damaged headers and the like).
  const downmix = p.channels > 2 ? ["-ac", "2"] : [];
  attempts.push({ args: [...INPUT(input, p.tags), "-c:a", "aac", "-b:a", "128k", ...downmix, "-movflags", "+faststart", "-f", "mp4", m4a], out: m4a, mime: "audio/mp4", ext: "m4a" });

  let lastError: unknown;
  for (const a of attempts) {
    try {
      await ffmpeg(a.args, signal);
      const out = await probe(a.out, signal).catch(() => null);
      return { file: a.out, mime: a.mime, ext: a.ext, bytes: (await stat(a.out)).size, durationMs: out?.durationMs ?? p.durationMs };
    } catch (err) {
      if (!(err instanceof ToolError) || (err.code === null && !err.timedOut)) throw err;
      lastError = err;
    }
  }
  throw new AudioUnusableError(
    "transcode_failed",
    lastError instanceof ToolError ? (lastError.timedOut ? "timed out" : lastError.stderr.slice(-200)) : "failed",
  );
}
