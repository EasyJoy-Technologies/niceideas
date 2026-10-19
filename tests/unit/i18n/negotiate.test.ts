import { describe, expect, it } from "vitest";
import { matchLocaleTag, negotiateLocale } from "@/i18n/negotiate";
import { resolveLocale } from "@/i18n/resolve";
import { LOCALES, directionOf } from "@/i18n/locales";

describe("matchLocaleTag", () => {
  it.each([
    ["zh-CN", "zh-Hans"], ["zh", "zh-Hans"], ["zh-SG", "zh-Hans"], ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"], ["zh-Hant-CN", "zh-Hant"], ["zh-Hans-HK", "zh-Hans"],
    ["pt", "pt-BR"], ["pt-BR", "pt-BR"], ["pt-PT", "pt-PT"], ["pt-AO", "pt-PT"],
    ["es-MX", "es"], ["en-GB", "en"], ["tl", "fil"], ["fil-PH", "fil"], ["in", "id"], ["iw", "he"],
    ["uz-Latn-UZ", "uz"], ["kk-KZ", "kk"], ["sw-KE", "sw"], ["ar-EG", "ar"],
  ])("%s → %s", (tag, expected) => {
    expect(matchLocaleTag(tag)).toBe(expected);
  });

  it("returns null for unsupported or malformed tags", () => {
    expect(matchLocaleTag("nb-NO")).toBeNull();
    expect(matchLocaleTag("x-invalid-@@")).toBeNull();
  });
});

describe("negotiateLocale", () => {
  it("respects q-values and order", () => {
    expect(negotiateLocale("nb-NO,da;q=0.9,de;q=0.8,en;q=0.7")).toBe("de");
    expect(negotiateLocale("fr;q=0.5,ja")).toBe("ja");
  });
  it("falls back to English", () => {
    expect(negotiateLocale(undefined)).toBe("en");
    expect(negotiateLocale("*")).toBe("en");
    expect(negotiateLocale("nb,da")).toBe("en");
    expect(negotiateLocale("de;q=0")).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("prefers cookie, then profile, then Accept-Language", () => {
    expect(resolveLocale({ cookieLocale: "ko", profileLocale: "ja", acceptLanguage: "de" })).toBe("ko");
    expect(resolveLocale({ cookieLocale: "bogus", profileLocale: "ja", acceptLanguage: "de" })).toBe("ja");
    expect(resolveLocale({ acceptLanguage: "zh-TW" })).toBe("zh-Hant");
    expect(resolveLocale({})).toBe("en");
  });
});

describe("locales", () => {
  it("registers exactly 40 unique locales with RTL for ar/fa/he/ur", () => {
    expect(new Set(LOCALES).size).toBe(40);
    expect(LOCALES.filter((l) => directionOf(l) === "rtl").sort()).toEqual(["ar", "fa", "he", "ur"]);
  });
});
