import { describe, expect, it } from "vitest";
import { countryFromHeaders, decideAccess, type AccessClass } from "@/server/region/region-policy";

const ALL: AccessClass[] = ["share", "publish_api", "third_party_api", "public_meta", "site", "site_api"];

describe("decideAccess", () => {
  it("CN in link_only mode: only links, publishing, third-party and meta", () => {
    const allowed = ALL.filter((access) => decideAccess({ country: "CN", access, mode: "link_only" }).allowed);
    expect(allowed).toEqual(["share", "publish_api", "third_party_api", "public_meta"]);
    expect(decideAccess({ country: "CN", access: "share", mode: "link_only" })).toEqual({ allowed: true, restricted: true });
  });
  it("HK / MO / TW / unknown / other countries are unrestricted", () => {
    for (const country of ["HK", "MO", "TW", "US", "XX", null]) {
      expect(decideAccess({ country, access: "site", mode: "link_only" })).toEqual({ allowed: true, restricted: false });
    }
  });
  it("mode off disables the rule", () => {
    expect(decideAccess({ country: "CN", access: "site", mode: "off" }).allowed).toBe(true);
  });
});

describe("countryFromHeaders", () => {
  it("normalizes and validates CF-IPCountry", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": " cn " }))).toBe("CN");
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "China" }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
  });
});
