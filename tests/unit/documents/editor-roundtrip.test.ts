import { describe, expect, it } from "vitest";
import { blockMarkdown } from "@/server/posts/editor-markdown";
import { markdownToEditor } from "@/server/posts/markdown-editor";
import type { SourceLine } from "@/server/documents/source-schema";
import { linesToEditor } from "@/server/posts/source-editor";

const toMarkdown = (md: string) => markdownToEditor(md).map((n) => blockMarkdown(n, () => undefined)).join("\n\n");

describe("editor ⇄ Markdown", () => {
  it("opens what the editor wrote unchanged", () => {
    for (const md of [
      "## Walk\n\nA **bold** and *italic* ~~old~~ `code` [link](https://example.com/a) word.",
      "- one\n- two\n\n  - nested",
      "3. third\n4. fourth",
      "> quoted\n> line",
      "```\nconst a = 1;\n```",
      "---",
      "### Small heading",
      "first line\nsecond line",
    ])
      expect(toMarkdown(md)).toBe(md);
  });
  it("never turns unsafe links into links", () => {
    expect(JSON.stringify(markdownToEditor("[x](javascript:alert(1))"))).not.toContain('"link"');
  });
  it("NiceNote lines become editor lists, quotes and headings", () => {
    const lines = [
      { kind: "heading", level: 1, runs: [{ text: "Title" }] },
      { kind: "bullet", runs: [{ text: "a", bold: true }] },
      { kind: "bullet", indent: 1, runs: [{ text: "b" }] },
      { kind: "quote", runs: [{ text: "q" }] },
    ] as SourceLine[];
    const nodes = linesToEditor(lines);
    expect(nodes.map((n) => blockMarkdown(n, () => undefined)).join("\n\n")).toBe("## Title\n\n- **a**\n\n  - b\n\n> q");
  });
});
