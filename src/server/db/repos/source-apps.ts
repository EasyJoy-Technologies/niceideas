import { sql } from "kysely";
import type { Db } from "../client";
import type { SourceAppNames, SourceAppRow } from "../schema";

/** Our own apps (source_app), in the order they were registered. */
export async function listSourceApps(db: Db): Promise<SourceAppRow[]> {
  return db.selectFrom("source_app").selectAll().orderBy("created_at").orderBy("key").execute();
}

/**
 * Registers an app on its first share (badge off until turned on) or refreshes its names to the latest the
 * backend sent; badge setting, website and icon are kept.
 */
export async function registerSourceApp(db: Db, app: { key: string; names: SourceAppNames }): Promise<void> {
  const names = JSON.stringify(app.names);
  await db
    .insertInto("source_app")
    .values({ key: app.key, names })
    .onConflict((oc) => oc.column("key").doUpdateSet({ names, updated_at: new Date() }).where(sql<boolean>`source_app.names IS DISTINCT FROM excluded.names`))
    .execute();
}

export type SourceAppSettings = { showBadge: boolean; websiteUrl: string | null; iconUrl: string | null };

export async function updateSourceApp(db: Db, key: string, s: SourceAppSettings): Promise<boolean> {
  const r = await db
    .updateTable("source_app")
    .set({ show_badge: s.showBadge, website_url: s.websiteUrl, icon_url: s.iconUrl, updated_at: new Date() })
    .where("key", "=", key)
    .executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

export async function setApiClientBadge(db: Db, clientId: string, show: boolean): Promise<boolean> {
  const r = await db.updateTable("api_client").set({ show_badge: show }).where("client_id", "=", clientId).executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

/** Number of posts per app: `app:<key>` for our apps, `api:<client_id>` for third-party apps. */
export async function countPostsByApp(db: Db): Promise<Map<string, number>> {
  const { rows } = await sql<{ k: string; n: string }>`
    SELECT 'app:' || source_app_key AS k, count(*) AS n FROM post WHERE source_app_key IS NOT NULL GROUP BY source_app_key
    UNION ALL
    SELECT source AS k, count(*) AS n FROM post WHERE source LIKE 'api:%' GROUP BY source`.execute(db);
  return new Map(rows.map((r) => [r.k, Number(r.n)]));
}
