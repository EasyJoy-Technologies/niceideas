import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/server/render/markdown";
import { inlineMarkdown, type PmNode } from "@/server/posts/editor-markdown";
import { editorBlocks } from "@/server/posts/web-compose-doc";

const text = (t: string, ...marks: string[]): PmNode => ({ type: "text", text: t, marks: marks.map((type) => ({ type })) });
const p = (...content: PmNode[]): PmNode => ({ type: "paragraph", content });
const doc = (...content: PmNode[]) => JSON.stringify({ type: "doc", content });

describe("editor JSON → Markdown", () => {
  it("keeps marks, moves boundary spaces outside delimiters and escapes author text", () => {
    expect(inlineMarkdown([text("a "), text("bold ", "bold"), text("and "), text("both", "bold", "italic")])).toBe("a **bold** and ***both***");
    expect(inlineMarkdown([text("1*2 [x] <b>")])).toBe("1\\*2 \\[x\\] \\<b\\>");
    expect(inlineMarkdown([text("a`b", "code")])).toBe("``a`b``");
  });

  it("keeps only http(s) / mailto links", () => {
    const link = (href: string): PmNode => ({ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] });
    expect(inlineMarkdown([link("https://a.test/(1)")])).toBe("[x](https://a.test/%281%29)");
    expect(inlineMarkdown([link("javascript:alert(1)")])).toBe("x");
  });

  it("builds markdown / todo / media blocks in document order", () => {
    const blocks = editorBlocks(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        p(text("Hello "), text("world", "bold")),
        { type: "image", attrs: { file: 0 } },
        { type: "bulletList", content: [{ type: "listItem", content: [p(text("one"))] }, { type: "listItem", content: [p(text("two"))] }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(text("done"))] }] },
        { type: "audio", attrs: { file: 1 } },
        p(text("# not a heading")),
      ),
    );
    expect(blocks).toEqual([
      { type: "text", format: "markdown", text: "## Title\n\nHello **world**" },
      { type: "media", kind: "image", file: 0 },
      { type: "text", format: "markdown", text: "- one\n- two" },
      { type: "todo", items: [{ text: "done", checked: true }] },
      { type: "media", kind: "audio", file: 1 },
      { type: "text", format: "markdown", text: "\\# not a heading" },
    ]);
    const md = blocks[0].type === "text" ? blocks[0].text : "";
    expect(renderMarkdown(md)).toContain("<strong>world</strong>");
  });

  it("renders quotes, code blocks and dividers", () => {
    const [b] = editorBlocks(
      doc(
        { type: "blockquote", content: [p(text("q"))] },
        { type: "codeBlock", content: [text("let a = 1;\n```")] },
        { type: "horizontalRule" },
        { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(text("c"))] }] },
      ),
    );
    expect(b).toEqual({ type: "text", format: "markdown", text: "> q\n\n````\nlet a = 1;\n```\n````\n\n---\n\n3. c" });
  });

  it("rejects malformed, deep or non-doc input and bad file references", () => {
    expect(() => editorBlocks("{")).toThrow();
    expect(() => editorBlocks(JSON.stringify({ type: "paragraph" }))).toThrow();
    let deep: PmNode = text("x");
    for (let i = 0; i < 40; i++) deep = { type: "blockquote", content: [deep] };
    expect(() => editorBlocks(doc(deep))).toThrow();
    expect(() => editorBlocks(doc({ type: "image", attrs: { file: -1 } }))).toThrow();
    expect(editorBlocks(doc(p(), { type: "unknown" }))).toEqual([]);
  });
});
