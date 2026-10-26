import MarkdownIt from "markdown-it";
import type { PmMark, PmNode } from "./editor-markdown";

/**
 * Markdown (as written by the web editor, src/server/posts/editor-markdown.ts) → editor nodes, so a
 * post opens in the editor as it was written. Same parser settings as the page renderer.
 */
const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: true });
type Token = ReturnType<typeof md.parse>[number];
const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const MARKS: Record<string, string> = { strong_open: "bold", em_open: "italic", s_open: "strike" };

function inline(tokens: Token[] = []): PmNode[] {
  const out: PmNode[] = [];
  const active: PmMark[] = [];
  const text = (t: string, extra: PmMark[] = []) => {
    if (!t) return;
    const marks = [...active, ...extra];
    out.push(marks.length ? { type: "text", text: t, marks } : { type: "text", text: t });
  };
  for (const t of tokens) {
    if (t.type === "text") text(t.content);
    else if (t.type === "code_inline") text(t.content, [{ type: "code" }]);
    else if (t.type === "softbreak" || t.type === "hardbreak") out.push({ type: "hardBreak" });
    else if (MARKS[t.type]) active.push({ type: MARKS[t.type] });
    else if (t.type.endsWith("_close") && MARKS[t.type.replace("_close", "_open")]) active.splice(active.findLastIndex((m) => m.type === MARKS[t.type.replace("_close", "_open")]), 1);
    else if (t.type === "link_open") {
      const href = String(t.attrGet("href") ?? "");
      active.push(SAFE_URL.test(href) ? { type: "link", attrs: { href } } : { type: "nolink" });
    } else if (t.type === "link_close") active.splice(active.findLastIndex((m) => m.type === "link" || m.type === "nolink"), 1);
  }
  return out.map((n) => (n.marks ? { ...n, marks: n.marks.filter((m) => m.type !== "nolink") } : n)).map((n) => (n.marks?.length === 0 ? { type: n.type, text: n.text } : n));
}

/** Block tokens → nodes; `i` advances through the token list (nested containers recurse). */
function blocks(tokens: Token[], start: number, end: string | null): { nodes: PmNode[]; next: number } {
  const nodes: PmNode[] = [];
  let i = start;
  while (i < tokens.length && tokens[i].type !== end) {
    const t = tokens[i];
    if (t.type === "paragraph_open") {
      const content = inline(tokens[i + 1].children ?? []);
      nodes.push(content.length ? { type: "paragraph", content } : { type: "paragraph" });
      i += 3;
    } else if (t.type === "heading_open") {
      const level = Number(t.tag.slice(1)) >= 3 ? 3 : 2;
      nodes.push({ type: "heading", attrs: { level }, content: inline(tokens[i + 1].children ?? []) });
      i += 3;
    } else if (t.type === "bullet_list_open" || t.type === "ordered_list_open") {
      const items: PmNode[] = [];
      const close = t.type.replace("_open", "_close");
      i++;
      while (tokens[i].type !== close) {
        const inner = blocks(tokens, i + 1, "list_item_close");
        items.push({ type: "listItem", content: inner.nodes.length ? inner.nodes : [{ type: "paragraph" }] });
        i = inner.next + 1;
      }
      const startAt = Number(t.attrGet("start") ?? 1);
      nodes.push(t.type === "ordered_list_open" ? { type: "orderedList", attrs: { start: startAt }, content: items } : { type: "bulletList", content: items });
      i++;
    } else if (t.type === "blockquote_open") {
      const inner = blocks(tokens, i + 1, "blockquote_close");
      nodes.push({ type: "blockquote", content: inner.nodes.length ? inner.nodes : [{ type: "paragraph" }] });
      i = inner.next + 1;
    } else if (t.type === "fence" || t.type === "code_block") {
      const code = t.content.replace(/\n$/, "");
      nodes.push(code ? { type: "codeBlock", content: [{ type: "text", text: code }] } : { type: "codeBlock" });
      i++;
    } else if (t.type === "hr") {
      nodes.push({ type: "horizontalRule" });
      i++;
    } else i++;
  }
  return { nodes, next: i };
}

export function markdownToEditor(source: string): PmNode[] {
  return blocks(md.parse(source, {}), 0, null).nodes;
}

/** Plain text (one paragraph per line, as the no-JS compose box writes it). */
export function plainToEditor(text: string): PmNode[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] }));
}
