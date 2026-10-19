import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { generateHandle, isValidHandle } from "@/server/profiles/handles";
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
  it("generates valid, non-reserved handles", () => {
    for (let i = 0; i < 200; i++) expect(isValidHandle(generateHandle())).toBe(true);
    expect(isValidHandle("admin")).toBe(false);
  });
});
