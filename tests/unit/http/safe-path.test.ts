import { describe, expect, it } from "vitest";
import { safeNext } from "@/server/auth/web/settings";
import { safeRedirectPath } from "@/server/http/safe-path";

describe("redirect targets from user input", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/p/abc?x=1#c")).toBe("/p/abc?x=1#c");
    expect(safeRedirectPath("/@name")).toBe("/@name");
    expect(safeRedirectPath("/p/abc%20d?q=%E4%B8%AD")).toBe("/p/abc%20d?q=%E4%B8%AD");
  });
  it("rejects other hosts, including tab / newline tricks browsers would strip", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "https://evil.example", "evil", "", null, "/a b", "/x\u0000"])
      expect(safeRedirectPath(bad as string | null)).toBe("/");
    expect(safeRedirectPath("/" + "a".repeat(600))).toBe("/");
  });
  it("sign-in never returns to /auth/", () => {
    expect(safeNext("/auth/callback")).toBe("/");
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("/settings")).toBe("/settings");
  });
  it("percent-encodes non-ASCII characters so the path can be a Location header", () => {
    expect(safeRedirectPath("/search?q=中文")).toBe("/search?q=%E4%B8%AD%E6%96%87");
    expect(safeRedirectPath("/p/é😀")).toBe("/p/%C3%A9%F0%9F%98%80");
    expect(safeRedirectPath("/p/\ud800x")).toBe("/p/%EF%BF%BDx");
    expect(() => new Headers({ Location: safeRedirectPath("/search?q=中文") })).not.toThrow();
  });
});
