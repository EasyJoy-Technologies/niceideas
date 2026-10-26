import { describe, expect, it } from "vitest";
import { resolveByteRange, singleByteRange } from "@/server/storage/range";

describe("single byte ranges (own media route)", () => {
  it("accepts one well-formed byte range only", () => {
    expect(singleByteRange("bytes=0-99")).toBe("bytes=0-99");
    expect(singleByteRange(" bytes=100- ")).toBe("bytes=100-");
    expect(singleByteRange("bytes=-500")).toBe("bytes=-500");
    for (const bad of [null, "", "bytes=-", "bytes=0-1,5-9", "items=0-1", "bytes=a-b"]) expect(singleByteRange(bad)).toBeNull();
  });

  it("resolves offsets within the object, clamping the end", () => {
    expect(resolveByteRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(resolveByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(resolveByteRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
    expect(resolveByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(resolveByteRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(resolveByteRange("bytes=100-", 100)).toBeNull();
    expect(resolveByteRange("bytes=9-3", 100)).toBeNull();
    expect(resolveByteRange("bytes=-0", 100)).toBeNull();
    expect(resolveByteRange("bytes=0-0", 0)).toBeNull();
  });
});
