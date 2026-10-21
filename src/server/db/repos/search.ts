import { sql } from "kysely";
import type { Db } from "../client";
import type { Profile } from "../schema";
import { containsPattern } from "./feed";

/** Active profiles whose handle or display name contains `query`; exact handle first, then newest. */
export async function searchProfiles(db: Db, query: string, limit: number): Promise<Profile[]> {
  const handle = query.replace(/^@/, "").toLowerCase();
  return db
    .selectFrom("profile")
    .selectAll()
    .where("status", "=", "active")
    .where(sql<string>`handle || ' ' || display_name`, "ilike", containsPattern(query.replace(/^@/, "")))
    .orderBy(sql`handle = ${handle}`, "desc")
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
}
