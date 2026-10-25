import { randomUUID } from "node:crypto";
import sharp from "@/server/media/sharp";
import { getConfig } from "@/server/config/env";
import { publicUrl } from "@/server/media/keys";

/** Avatars live in the public bucket under `a/` (random names; old ones are deleted when replaced). */
const AVATAR_PREFIX = "a/";
export const AVATAR_SIZE = 256;
/** Bigger avatars are not decoded at all. */
const AVATAR_MAX_PIXELS = 25_000_000;
/** Avatar URLs never change content: cache for a year. */
export const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const newAvatarKey = () => `${AVATAR_PREFIX}${randomUUID()}.webp`;

/** Object key of an avatar served from our public bucket; null for any other URL (old third-party avatars, none). */
export function ownAvatarKey(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  const base = `${getConfig().MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "")}/`;
  const key = avatarUrl.startsWith(base) ? avatarUrl.slice(base.length) : "";
  return /^a\/[0-9a-f-]{36}\.webp$/.test(key) ? key : null;
}

export const avatarUrlOf = (key: string) => publicUrl(key);

/** Square 256 px WebP from any image sharp can decode (first frame, metadata dropped); throws when undecodable. */
export async function avatarWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: AVATAR_MAX_PIXELS, animated: false, failOn: "error" })
    .autoOrient()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}
