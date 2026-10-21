import type { Db } from "../client";
import type { ApiClient } from "../schema";

export async function findActiveApiClient(db: Db, clientId: string): Promise<ApiClient | undefined> {
  return db.selectFrom("api_client").selectAll().where("client_id", "=", clientId).where("status", "=", "active").executeTakeFirst();
}

export async function listApiClients(db: Db): Promise<ApiClient[]> {
  return db.selectFrom("api_client").selectAll().orderBy("created_at").execute();
}

export async function upsertApiClient(db: Db, c: { clientId: string; sourceKey: string; name: string; homepageUrl: string; iconUrl: string | null }): Promise<ApiClient> {
  const values = { client_id: c.clientId, source_key: c.sourceKey, name: c.name, homepage_url: c.homepageUrl, icon_url: c.iconUrl };
  return db
    .insertInto("api_client")
    .values(values)
    .onConflict((oc) => oc.column("client_id").doUpdateSet({ source_key: c.sourceKey, name: c.name, homepage_url: c.homepageUrl, icon_url: c.iconUrl }))
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setApiClientStatus(db: Db, clientId: string, status: "active" | "disabled"): Promise<boolean> {
  const r = await db.updateTable("api_client").set({ status }).where("client_id", "=", clientId).executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}
