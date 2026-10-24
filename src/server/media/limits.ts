import { getConfig } from "@/server/config/env";
import type { MediaLimits } from "./ingest";

export function mediaLimitsFromConfig(): MediaLimits {
  const c = getConfig();
  return {
    maxImageBytes: c.MEDIA_MAX_IMAGE_BYTES,
    maxAudioBytes: c.MEDIA_MAX_AUDIO_BYTES,
    maxAudioSeconds: c.MEDIA_MAX_AUDIO_SECONDS,
    maxImagePixels: c.MEDIA_MAX_IMAGE_PIXELS,
  };
}
