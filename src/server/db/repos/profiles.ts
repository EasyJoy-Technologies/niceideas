import type { Db } from "../client";
import type { NewProfile, Profile } from "../schema";

export async function findProfile(db: Db, userId: string): Promise<Profile | undefined> {
  return db.selectFrom("profile").selectAll().where("user_id", "=", userId).executeTakeFirst();
}

export async function findProfileByHandle(db: Db, handle: string): Promise<Profile | undefined> {
  return db.selectFrom("profile").selectAll().where("handle", "=", handle).executeTakeFirst();
}

type FirstProfile = Pick<NewProfile, "user_id" | "handle" | "display_name" | "bio">;

/**
 * Inserts a profile unless one exists for the user. Returns the stored row, or `undefined` when the
 * handle collided (caller retries with another handle) or the user's deletion completed (never recreated).
 */
export async function insertProfileIfAbsent(db: Db, row: FirstProfile): Promise<Profile | undefined> {
  try {
    const inserted = await db
      .insertInto("profile")
      .columns(["user_id", "handle", "display_name", "bio"])
      .expression(
        db
          .selectNoFrom((eb) => [eb.val(row.user_id).as("user_id"), eb.val(row.handle).as("handle"), eb.val(row.display_name).as("display_name"), eb.val(row.bio).as("bio")])
          .where(({ not, exists, selectFrom }) => not(exists(selectFrom("deleted_account").select("user_id").where("user_id", "=", row.user_id)))),
      )
      .onConflict((oc) => oc.column("user_id").doNothing())
      .returningAll()
      .executeTakeFirst();
    return inserted ?? (await findProfile(db, row.user_id));
  } catch (err) {
    if (isUniqueViolation(err, "profile_handle_key")) return undefined;
    throw err;
  }
}

export async function updateProfileDisplayName(db: Db, userId: string, displayName: string): Promise<void> {
  await db.updateTable("profile").set({ display_name: displayName, updated_at: new Date() }).where("user_id", "=", userId).execute();
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && (constraint === undefined || e.constraint === constraint);
}
