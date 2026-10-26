/**
 * Web editor (Tiptap / ProseMirror JSON) → Markdown for one block-level node.
 * Output is rendered by src/server/render/markdown.ts (raw HTML off, sanitized),
 * so this only has to be faithful, not safe: author text is escaped, links are
 * limited to http(s) / mailto.
 */
import { escapeMarkdown } from "@/server/render/escape";

export type PmMark = { type: string; attrs?: Record<string, unknown> };
export type PmNode = { type: string; attrs?: Record<string, unknown>; content?: PmNode[]; text?: string; marks?: PmMark[] };

/** Outer → inner; code is innermost (a code span is literal). */
const MARK_ORDER = ["link", "bold", "italic", "strike", "code"] as const;
type MarkName = (typeof MARK_ORDER)[number];
type Active = { name: MarkName; href?: string; fence?: string };
const DELIM: Record<Exclude<MarkName, "link" | "code">, string> = { bold: "**", italic: "*", strike: "~~" };
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

const key = (m: Active) => (m.name === "link" ? `link:${m.href}` : m.name);
const escapeUrl = (s: string) => s.replace(/[()<>\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

function marksOf(n: PmNode): Active[] {
  const out: Active[] = [];
  for (const name of MARK_ORDER) {
    const m = n.marks?.find((x) => x.type === name);
    if (!m) continue;
    if (name !== "link") out.push({ name });
    else if (typeof m.attrs?.href === "string" && SAFE_URL.test(m.attrs.href)) out.push({ name, href: m.attrs.href });
  }
  return out;
}

function opener(m: Active): string {
  if (m.name === "link") return "[";
  if (m.name === "code") return m.fence!;
  return DELIM[m.name];
}
function closer(m: Active): string {
  if (m.name === "link") return `](${escapeUrl(m.href!)})`;
  if (m.name === "code") return [...m.fence!].reverse().join("");
  return DELIM[m.name];
}
/** Backtick fence longer than any run inside; padded when the code starts or ends with a backtick. */
function codeFence(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const pad = /^`|`$/.test(text) ? " " : "";
  return "`".repeat(longest + 1) + pad;
}

/**
 * Inline content → Markdown. Marks are opened / closed only where they change, and
 * whitespace at a mark boundary is moved outside the delimiters (CommonMark flanking).
 */
export function inlineMarkdown(nodes: PmNode[] = []): string {
  let out = "";
  let pending = "";
  let active: Active[] = [];
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      pending += "\n";
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const [, lead, core, trail] = n.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    if (!core) {
      pending += n.text;
      continue;
    }
    pending += lead;
    const next = marksOf(n);
    let same = 0;
    while (same < active.length && same < next.length && key(active[same]) === key(next[same])) same++;
    for (let j = active.length - 1; j >= same; j--) out += closer(active[j]);
    out += pending;
    pending = "";
    for (let j = same; j < next.length; j++) {
      if (next[j].name === "code") next[j] = { ...next[j], fence: codeFence(core) };
      out += opener(next[j]);
    }
    active = [...active.slice(0, same), ...next.slice(same)];
    out += active.some((m) => m.name === "code") ? core.replace(/\n/g, " ") : escapeMarkdown(core);
    pending = trail;
  }
  for (let j = active.length - 1; j >= 0; j--) out += closer(active[j]);
  return out + pending;
}

/** Paragraph text: no leading indentation (code block), block markers at line start escaped. */
function paragraphLines(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/^[ \t]+/, "").replace(/^([#>+\-=])/, "\\$1").replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2"))
    .join("\n")
    .trimEnd();
}

const plain = (n: PmNode): string => (n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : (n.content ?? []).map(plain).join(""));
const indent = (s: string, by: string) => s.split("\n").map((l, i) => (i === 0 || !l ? l : by + l)).join("\n");

function listMarkdown(list: PmNode, hoist: (n: PmNode) => void): string {
  const start = typeof list.attrs?.start === "number" ? list.attrs.start : 1;
  return (list.content ?? [])
    .map((item, i) => {
      const marker = list.type === "orderedList" ? `${start + i}. ` : list.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}] ` : "- ";
      const body = (item.content ?? []).map((c) => blockMarkdown(c, hoist)).filter(Boolean).join("\n\n");
      return marker + indent(body, " ".repeat(marker.length));
    })
    .join("\n");
}

/** One block node → Markdown ("" when empty). Media nodes are handed to `hoist` (placed after this block). */
export function blockMarkdown(node: PmNode, hoist: (n: PmNode) => void): string {
  switch (node.type) {
    case "paragraph":
      return paragraphLines(inlineMarkdown(node.content));
    case "heading": {
      const text = inlineMarkdown(node.content).replace(/\s*\n\s*/g, " ").trim();
      return text ? `${node.attrs?.level === 3 ? "###" : "##"} ${text}` : "";
    }
    case "blockquote": {
      const body = (node.content ?? []).map((c) => blockMarkdown(c, hoist)).filter(Boolean).join("\n\n");
      return body ? body.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n") : "";
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return listMarkdown(node, hoist);
    case "codeBlock": {
      const code = plain(node).replace(/\n+$/, "");
      if (!code.trim()) return "";
      const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((r) => r.length));
      const fence = "`".repeat(longest + 1);
      return `${fence}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "image":
    case "audio":
      hoist(node);
      return "";
    default:
      return "";
  }
}

/** Plain text of a task item (one line). */
export function itemText(node: PmNode): string {
  return plain(node).replace(/\s+/g, " ").trim();
}
