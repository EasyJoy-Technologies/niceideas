import { describe, expect, it } from "vitest";
import { createShareBody, parseBody } from "@/server/nicenote/requests";
import { parseSourceApp } from "@/server/nicenote/source-app";
import { sourceAppName } from "@/server/share/source-apps";

const names = { en: "NiceRecorder", "zh-Hans": "易录音", "zh-Hant": "易錄音" };

describe("sourceApp (contract §3.2)", () => {
  it("accepts a valid key with an English name; drops unknown locales and blank optional names", () => {
    expect(parseSourceApp({ key: "nicerecorder", names })).toEqual({ key: "nicerecorder", names });
    expect(parseSourceApp({ key: "nice-list2", names: { en: " NiceList ", ja: "x" } })).toEqual({ key: "nice-list2", names: { en: "NiceList" } });
  });

  it("gives null for anything missing or invalid", () => {
    for (const raw of [undefined, null, "nicenote", {}, { key: "nicenote" }, { key: "Nicenote", names }, { key: "1app", names }, { key: "a".repeat(41), names },
      { key: "nicenote", names: { "zh-Hans": "x" } }, { key: "nicenote", names: { en: " " } }, { key: "nicenote", names: { en: "x".repeat(101) } },
      { key: "nicenote", names: { en: "NiceNote", "zh-Hans": 5 } }]) {
      expect(parseSourceApp(raw)).toBeNull();
    }
  });

  it("never fails the create request", () => {
    const base = { shareId: "6f1c1c1e-8a4b-4c39-9a52-0d6b7f0f2a11", userId: "u1", region: "intl" };
    expect(parseBody(createShareBody, base).sourceApp).toBeNull();
    expect(parseBody(createShareBody, { ...base, sourceApp: { key: 5 } }).sourceApp).toBeNull();
    expect(parseBody(createShareBody, { ...base, sourceApp: { key: "nicerecorder", names } }).sourceApp).toEqual({ key: "nicerecorder", names });
  });

  it("names: Simplified / Traditional Chinese when sent, English everywhere else", () => {
    expect(sourceAppName(names, "zh-Hans")).toBe("易录音");
    expect(sourceAppName(names, "zh-Hant")).toBe("易錄音");
    expect(sourceAppName(names, "en")).toBe("NiceRecorder");
    expect(sourceAppName(names, "ja")).toBe("NiceRecorder");
    expect(sourceAppName({ en: "NiceList" }, "zh-Hant")).toBe("NiceList");
  });
});
