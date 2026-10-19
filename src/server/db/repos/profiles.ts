import type { Db } from "../client";
import type { NewProfile, Profile } from "../schema";

export async function findProfile(db: Db, userId: string): Promise<Profile | undefined> {
  return db.selectFrom("profile").selectAll().where("user_id", "=", userId).executeTakeFirst();
}

export async function findProfileByHandle(db: Db, handle: string): Promise<Profile | undefined> {
  return db.selectFrom("profile").selectAll().where("handle", "=", handle).executeTakeFirst();
}

/**
 * Inserts a profile unless one exists for the user. Returns the stored row, or
 * `undefined` when the handle collided (caller retries with another handle).
 */
export async function insertProfileIfAbsent(db: Db, row: NewProfile): Promise<Profile | undefined> {
  try {
    const inserted = await db
      .insertInto("profile")
      .values(row)
      .onConflict((oc) => oc.column("user_id").doNothing())
      .returningAll()
      .executeTakeFirst();
    return inserted ?? (await findProfile(db, row.user_id));
  } catch (err) {
    if (isUniqueViolation(err, "profile_handle_key")) return undefined;
    throw err;
  }
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && (constraint === undefined || e.constraint === constraint);
}
