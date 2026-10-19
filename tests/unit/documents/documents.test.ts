import { describe, expect, it } from "vitest";
import { deriveCoverMediaId, deriveKind, deriveSummary, documentPlainText } from "@/server/documents/derive";
import { contentHash } from "@/server/documents/hash";
import { documentMediaIds, parseDocument } from "@/server/documents/validate";
import { ApiError } from "@/server/http/errors";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const doc = (blocks: unknown[], title?: string) => parseDocument({ version: 1, title, blocks });
const errCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  return "ok";
};

describe("parseDocument", () => {
  it("normalizes text, drops empty text blocks and control chars, defaults format", () => {
    const d = doc([{ type: "text", text: "a\r\nb\u0007" }, { type: "text", text: "   " }], "  Hi  ");
    expect(d).toEqual({ version: 1, title: "Hi", blocks: [{ type: "text", format: "plain", text: "a\nb" }] });
  });
  it("rejects invalid structure, unknown blocks, empty docs and over-limits", () => {
    expect(errCode(() => parseDocument({ version: 2, blocks: [] }))).toBe("document.invalid");
    expect(errCode(() => doc([{ type: "html", html: "<script>" }]))).toBe("document.invalid");
    expect(errCode(() => doc([{ type: "image", mediaId: "not-a-uuid" }]))).toBe("document.invalid");
    expect(errCode(() => doc([{ type: "text", text: " " }]))).toBe("document.empty");
    expect(errCode(() => doc([{ type: "text", text: "x".repeat(100_001) }]))).toBe("document.too_long");
    expect(errCode(() => doc(Array.from({ length: 11 }, () => ({ type: "audio", mediaId: ID1 }))))).toBe("document.too_many_audios");
  });
  it("lists media ids once in order", () => {
    const d = doc([{ type: "image", mediaId: ID2 }, { type: "audio", mediaId: ID1 }, { type: "image", mediaId: ID2 }]);
    expect(documentMediaIds(d)).toEqual([ID2, ID1]);
  });
});

describe("derive", () => {
  it("short vs article", () => {
    expect(deriveKind(doc([{ type: "text", text: "hello" }, { type: "todo", items: [{ text: "milk" }] }]))).toBe("short");
    expect(deriveKind(doc([{ type: "text", text: "x".repeat(501) }]))).toBe("article");
    expect(deriveKind(doc([{ type: "text", text: "x" }, { type: "image", mediaId: ID1 }]))).toBe("article");
    expect(deriveKind(doc([{ type: "text", text: "汉".repeat(500) }]))).toBe("short");
  });
  it("summary is markdown-free, single-line and truncated", () => {
    const d = doc([{ type: "text", format: "markdown", text: "# Title\n\n**bold** [link](https://x.y) & <b>" }]);
    expect(documentPlainText(d)).toContain("bold link & <b>");
    expect(deriveSummary(d)).toBe("Title bold link & <b>");
    const long = deriveSummary(doc([{ type: "text", text: "word ".repeat(100) }]));
    expect(Array.from(long).length).toBeLessThanOrEqual(201);
    expect(long.endsWith("…")).toBe(true);
  });
  it("cover = first image", () => {
    expect(deriveCoverMediaId(doc([{ type: "audio", mediaId: ID1 }, { type: "image", mediaId: ID2 }]))).toBe(ID2);
  });
});

describe("contentHash", () => {
  it("is key-order independent and content sensitive", () => {
    const a = contentHash({ version: 1, blocks: [{ type: "text", format: "plain", text: "x" }] });
    const b = contentHash({ blocks: [{ text: "x", format: "plain", type: "text" }], version: 1 });
    expect(a).toBe(b);
    expect(contentHash({ version: 1, blocks: [{ type: "text", format: "plain", text: "y" }] })).not.toBe(a);
  });
});
