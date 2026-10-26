import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { Media } from "@/server/db/schema";
import { insertCdnPurges } from "@/server/db/repos/cdn-purge";
import { mediaKeys, publicUrl } from "@/server/media/keys";
import { postUrl } from "@/server/posts/post-dto";
import { OG_VARIANTS } from "@/server/share/og-image";

/**
 * What to purge from the CDN edge when content goes offline (F22), queued in the same transaction
 * (sent by the worker, cdn/purge-runner.ts). Nothing is queued without a purge token.
 */
const enabled = () => !!getConfig().CLOUDFLARE_PURGE_TOKEN;

/** Every public URL of media that just left the public store. */
export async function queueMediaPurge(trx: Db, media: Pick<Media, "variants">[]): Promise<void> {
  if (!enabled()) return;
  await insertCdnPurges(trx, media.flatMap((m) => mediaKeys(m).map(publicUrl)));
}

/** Share-card images of posts that went offline (the page itself is cached for seconds only). */
export async function queuePostPurge(trx: Db, slugs: string[]): Promise<void> {
  if (!enabled()) return;
  await insertCdnPurges(trx, slugs.flatMap((slug) => Object.keys(OG_VARIANTS).map((v) => `${postUrl(slug)}/og/${v}`)));
}
