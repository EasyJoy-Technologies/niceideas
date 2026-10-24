import { describe, expect, it } from "vitest";
import { fetchPublicHttps, isPublicAddress } from "@/server/http/public-https";

describe("public https fetch guard", () => {
  it("only public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
      expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
    }
  });

  it("refuses non-https URLs and private literal addresses before connecting", async () => {
    const err = (url: string) => fetchPublicHttps(url, { maxBytes: 1000, timeoutMs: 1000 }).then(() => null, (e: { message: string; permanent: boolean }) => [e.message, e.permanent]);
    expect(await err("http://example.com/a.png")).toEqual(["only plain https urls", true]);
    expect(await err("https://user:pw@example.com/a.png")).toEqual(["only plain https urls", true]);
    expect(await err("https://127.0.0.1/a.png")).toEqual(["address not public", true]);
    expect(await err("https://[::1]/a.png")).toEqual(["address not public", true]);
    expect(await err("https://localhost/a.png")).toEqual(["address not public", true]);
  });
});
