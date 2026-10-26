import type { Db } from "@/server/db/client";
import type { MediaStores } from "@/server/storage/types";
import { mediaKeys } from "./keys";

export type PublicAudit = {
  /** Objects in the public store. */
  publicObjects: number;
  /** Public objects of media not recorded as public (the F06 gap): ids, for a visibility check. */
  strayMedia: string[];
  /** Public objects that belong to no media row (keys; avatars are not media). */
  unknownKeys: string[];
  /** Media recorded as public with a rendition missing from the public store. */
  missingMedia: string[];
};

/**
 * Read-only inventory of the public store against the media table (plan
 * docs/plan/2026-10-26-share-review-fixes.md S2, F06): finds objects that are public although the
 * database does not say so. Changes nothing.
 */
export async function auditPublicMedia(db: Db, stores: MediaStores): Promise<PublicAudit> {
  const objects = new Set(await stores.publicStore.listKeys("m/"));
  const owner = new Map<string, { id: string; public: boolean }>();
  const audit: PublicAudit = { publicObjects: objects.size, strayMedia: [], unknownKeys: [], missingMedia: [] };
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = await db.selectFrom("media").select(["id", "variants", "public_at"]).where("id", ">", after).orderBy("id").limit(500).execute();
    if (rows.length === 0) break;
    for (const m of rows) {
      const keys = mediaKeys(m);
      for (const k of keys) owner.set(k, { id: m.id, public: m.public_at !== null });
      if (m.public_at && keys.some((k) => !objects.has(k))) audit.missingMedia.push(m.id);
    }
    after = rows.at(-1)!.id;
  }
  const stray = new Set<string>();
  for (const key of objects) {
    const o = owner.get(key);
    if (!o) audit.unknownKeys.push(key);
    else if (!o.public) stray.add(o.id);
  }
  audit.strayMedia = [...stray];
  return audit;
}
