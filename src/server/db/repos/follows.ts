import type { Db } from "../client";

export async function setFollow(db: Db, followerId: string, followeeId: string, on: boolean): Promise<void> {
  if (followerId === followeeId) return;
  if (on) {
    await db.insertInto("follow").values({ follower_id: followerId, followee_id: followeeId }).onConflict((oc) => oc.doNothing()).execute();
  } else {
    await db.deleteFrom("follow").where("follower_id", "=", followerId).where("followee_id", "=", followeeId).execute();
  }
}

/** Which of `ids` the user follows. */
export async function followingAmong(db: Db, followerId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.selectFrom("follow").select("followee_id").where("follower_id", "=", followerId).where("followee_id", "in", ids).execute();
  return new Set(rows.map((r) => r.followee_id));
}

export async function countFollowing(db: Db, followerId: string): Promise<number> {
  const r = await db.selectFrom("follow").select((eb) => eb.fn.countAll<number>().as("n")).where("follower_id", "=", followerId).executeTakeFirstOrThrow();
  return Number(r.n);
}
