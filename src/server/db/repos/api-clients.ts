import type { Db } from "../client";
import type { ApiClient } from "../schema";

export async function findApiClient(db: Db, clientId: string): Promise<ApiClient | undefined> {
  return db.selectFrom("api_client").selectAll().where("client_id", "=", clientId).executeTakeFirst();
}

export async function findApiClientById(db: Db, id: string): Promise<ApiClient | undefined> {
  return db.selectFrom("api_client").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function listApiClients(db: Db): Promise<ApiClient[]> {
  return db.selectFrom("api_client").selectAll().orderBy("created_at").execute();
}

/** Creates the row on first sight or refreshes the directory fields; local policy columns are kept. */
export async function saveDirectoryEntry(
  db: Db,
  e: { clientId: string; name: string; logoUrl: string | null; websiteUrl: string | null; status: "active" | "suspended" },
): Promise<ApiClient> {
  const dir = { name: e.name, logo_url: e.logoUrl, website_url: e.websiteUrl, dir_status: e.status, fetched_at: new Date() };
  return db
    .insertInto("api_client")
    .values({ client_id: e.clientId, ...dir })
    .onConflict((oc) => oc.column("client_id").doUpdateSet(dir))
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Local block / unblock (independent of the directory status). */
export async function setApiClientStatus(db: Db, clientId: string, status: "active" | "disabled", note?: string): Promise<boolean> {
  const r = await db.updateTable("api_client").set(note === undefined ? { status } : { status, note }).where("client_id", "=", clientId).executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

export async function setApiClientRate(db: Db, clientId: string, postsPerHour: number | null): Promise<boolean> {
  const r = await db.updateTable("api_client").set({ posts_per_hour: postsPerHour }).where("client_id", "=", clientId).executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}
