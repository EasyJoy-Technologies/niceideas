import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { generateHandle, isValidHandle } from "@/server/profiles/handles";
import { syncProfileFromClaims } from "@/server/profiles/sync-from-claims";
import { startTestDb } from "../helpers/pg";

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startTestDb()));
afterAll(async () => stop?.());

describe("ensureProfile", () => {
  it("creates once with a valid handle and is stable / concurrency-safe", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureProfile(db, "logto-sub-1")));
    expect(new Set(results.map((p) => p.handle)).size).toBe(1);
    expect(isValidHandle(results[0].handle)).toBe(true);
  });
  it("starts with the NiceMatrix user id as handle; a random one if the id is unusable or taken", async () => {
    expect((await ensureProfile(db, "Ybksi0v7ysgi")).handle).toBe("ybksi0v7ysgi");
    await db.insertInto("profile").values({ user_id: "someone-else", handle: "q2w3e4r5t6y7", display_name: "", bio: "" }).execute();
    const taken = await ensureProfile(db, "q2w3e4r5t6y7");
    expect(taken.handle).not.toBe("q2w3e4r5t6y7");
    expect(isValidHandle(taken.handle)).toBe(true);
  });
  it("web sign-in without a username: a random handle becomes the user id, a username handle is kept", async () => {
    const p = await db.insertInto("profile").values({ user_id: "nousername12", handle: "uabcdefghj", display_name: "", bio: "" }).returningAll().executeTakeFirstOrThrow();
    const synced = await syncProfileFromClaims(db, p, { sub: "nousername12" });
    expect(synced.handle).toBe("nousername12");
    const named = await db.updateTable("profile").set({ handle: "chosen.name" }).where("user_id", "=", "nousername12").returningAll().executeTakeFirstOrThrow();
    expect((await syncProfileFromClaims(db, named, { sub: "nousername12" })).handle).toBe("chosen.name");
  });
  it("generates valid, non-reserved handles", () => {
    for (let i = 0; i < 200; i++) expect(isValidHandle(generateHandle())).toBe(true);
    expect(isValidHandle("admin")).toBe(false);
  });
});
