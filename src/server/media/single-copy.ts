import type { Db } from "@/server/db/client";
import { moveObject } from "@/server/storage/move";
import { ObjectMissingError, type MediaStores } from "@/server/storage/types";
import { renditionsOf } from "./keys";

export type SingleCopyReport = { media: number; renditions: number; missing: string[] };

/**
 * One-off conversion to one stored copy per file (v1.0.66): before, published media were copied to
 * the public store and kept in the private one too. Media marked public end up only in the public
 * store, all others only in the private store. Idempotent; renditions found in neither store are
 * reported, not fatal.
 */
export async function convertToSingleCopy(db: Db, stores: MediaStores, cacheControl: string): Promise<SingleCopyReport> {
  const report: SingleCopyReport = { media: 0, renditions: 0, missing: [] };
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = await db.selectFrom("media").select(["id", "variants", "public_at"]).where("id", ">", after).orderBy("id").limit(200).execute();
    if (rows.length === 0) return report;
    for (const m of rows) {
      const [from, to] = m.public_at ? [stores.privateStore, stores.publicStore] : [stores.publicStore, stores.privateStore];
      for (const r of renditionsOf(m)) {
        try {
          await moveObject(from, to, r.key, { contentType: r.mime, cacheControl: m.public_at ? cacheControl : undefined });
          report.renditions++;
        } catch (err) {
          if (!(err instanceof ObjectMissingError)) throw err;
          report.missing.push(r.key);
        }
      }
      report.media++;
    }
    after = rows.at(-1)!.id;
  }
}
