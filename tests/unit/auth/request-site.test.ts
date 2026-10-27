import { describe, expect, it } from "vitest";
import { requestSite } from "@/server/auth/app-ticket/request-site";

const OWN = "https://niceideas.app";
const site = (h: Record<string, string>) => requestSite(new Headers(h), OWN);

describe("app ticket exchange: where the request came from", () => {
  it("accepts the app's own top-level load (no / none / same-origin site, no / null / own origin)", () => {
    expect(site({})).toEqual({ fetchSite: "absent", origin: "absent", crossSite: false });
    expect(site({ "sec-fetch-site": "none" })).toEqual({ fetchSite: "none", origin: "absent", crossSite: false });
    expect(site({ "sec-fetch-site": "none", origin: "null" })).toEqual({ fetchSite: "none", origin: "null", crossSite: false });
    expect(site({ "sec-fetch-site": "same-origin", origin: OWN })).toEqual({ fetchSite: "same-origin", origin: "self", crossSite: false });
    expect(site({ "sec-fetch-site": " None " }).crossSite).toBe(false);
  });
  it("refuses other sites, sibling subdomains, foreign origins and unknown values", () => {
    expect(site({ "sec-fetch-site": "cross-site" }).crossSite).toBe(true);
    expect(site({ "sec-fetch-site": "same-site" }).crossSite).toBe(true);
    expect(site({ "sec-fetch-site": "weird" })).toEqual({ fetchSite: "other", origin: "absent", crossSite: true });
    expect(site({ origin: "https://evil.example" })).toEqual({ fetchSite: "absent", origin: "other", crossSite: true });
    expect(site({ "sec-fetch-site": "none", origin: "https://t.niceideas.app" }).crossSite).toBe(true);
  });
});
