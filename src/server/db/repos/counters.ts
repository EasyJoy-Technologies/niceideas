import { sql } from "kysely";
import type { Db } from "../client";

const since = (seconds: number) => sql<Date>`now() - make_interval(secs => ${seconds})`;

/** Posts created by an author within the window (any status: withdrawing does not refund quota). */
export async function countPostsSince(db: Db, authorId: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("post")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("author_id", "=", authorId)
    .where("published_at", ">", since(seconds))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function countRevisionsSince(db: Db, authorId: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("post_revision as r")
    .innerJoin("post as p", "p.id", "r.post_id")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("p.author_id", "=", authorId)
    .where("r.created_at", ">", since(seconds))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function countMediaSince(db: Db, ownerId: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("media")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("owner_id", "=", ownerId)
    .where("created_at", ">", since(seconds))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Posts published through one third-party client within the window (all its users). */
export async function countClientPostsSince(db: Db, apiClientId: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("post")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("api_client_id", "=", apiClientId)
    .where("published_at", ">", since(seconds))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Posts one user published through one third-party app within the window. */
export async function countAppUserPostsSince(db: Db, apiClientId: string, authorId: string, seconds: number): Promise<number> {
  const row = await db
    .selectFrom("post")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("api_client_id", "=", apiClientId)
    .where("author_id", "=", authorId)
    .where("published_at", ">", since(seconds))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}
