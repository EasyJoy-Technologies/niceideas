import { describe, expect, it } from "vitest";
import { needsPrompt, parseChoice, serializeChoice } from "@/client/consent/store";

describe("cookie choice", () => {
  it("round-trips categories and version", () => {
    const choice = { version: 2, grants: { analytics: true, ads: false } };
    expect(serializeChoice(choice)).toBe("v2.analytics-1.ads-0");
    expect(parseChoice("v2.analytics-1.ads-0")).toEqual(choice);
  });

  it("reads choices stored before categories existed as version 1 analytics", () => {
    expect(parseChoice("granted")).toEqual({ version: 1, grants: { analytics: true } });
    expect(parseChoice("denied")).toEqual({ version: 1, grants: { analytics: false } });
  });

  it("ignores missing or malformed values", () => {
    for (const raw of [undefined, null, "", "v0.analytics-1", "v1.analytics-2", "v1.Analytics-1", "1.analytics-1", "v1.analytics"]) {
      expect(parseChoice(raw)).toBeNull();
    }
  });

  it("asks when nothing is stored, the request version rises, or a new category is offered", () => {
    const choice = parseChoice("v1.analytics-0");
    expect(needsPrompt(null, 1, ["analytics"])).toBe(true);
    expect(needsPrompt(choice, 1, ["analytics"])).toBe(false);
    expect(needsPrompt(choice, 2, ["analytics"])).toBe(true);
    expect(needsPrompt(choice, 1, ["analytics", "ads"])).toBe(true);
    expect(needsPrompt(parseChoice("granted"), 1, ["analytics"])).toBe(false);
  });
});
