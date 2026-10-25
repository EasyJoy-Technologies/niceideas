import { describe, expect, it } from "vitest";
import { backupTime } from "@/server/ops/offsite-backup";

describe("off-site backup names", () => {
  it("reads the UTC time from the dump name", () => {
    expect(new Date(backupTime("niceideas-20261024T231944Z.sql.gz")).toISOString()).toBe("2026-10-24T23:19:44.000Z");
  });
});
