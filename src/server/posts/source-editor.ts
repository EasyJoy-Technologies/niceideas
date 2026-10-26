import type { SourceLine, SourceRun } from "@/server/documents/source-schema";
import type { PmMark, PmNode } from "./editor-markdown";

/** NiceNote rich lines → editor nodes (headings 2–3 only, lists nested by indent). */
export function runsToEditor(runs: SourceRun[]): PmNode[] {
  const out: PmNode[] = [];
  for (const r of runs) {
    const marks: PmMark[] = [];
    if (r.href) marks.push({ type: "link", attrs: { href: r.href } });
    if (r.bold) marks.push({ type: "bold" });
    if (r.italic) marks.push({ type: "italic" });
    if (r.strike) marks.push({ type: "strike" });
    if (r.code) marks.push({ type: "code" });
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (part) out.push(marks.length ? { type: "text", text: part, marks } : { type: "text", text: part });
    });
  }
  return out;
}

const para = (runs: SourceRun[]): PmNode => {
  const content = runsToEditor(runs);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};
const isList = (l: SourceLine) => l.kind === "bullet" || l.kind === "ordered";

/** Consecutive list lines → one list; deeper lines nest inside the previous item. */
function list(lines: SourceLine[], from: number, indent: number): { node: PmNode; next: number } {
  const ordered = lines[from].kind === "ordered";
  const items: PmNode[] = [];
  let i = from;
  while (i < lines.length && isList(lines[i]) && (lines[i].indent ?? 0) >= indent) {
    const l = lines[i];
    if ((l.indent ?? 0) > indent && items.length) {
      const sub = list(lines, i, l.indent ?? 0);
      items.at(-1)!.content!.push(sub.node);
      i = sub.next;
      continue;
    }
    if ((l.kind === "ordered") !== ordered) break;
    items.push({ type: "listItem", content: [para(l.runs)] });
    i++;
  }
  const start = lines[from].number;
  return { node: ordered ? { type: "orderedList", attrs: { start: start ?? 1 }, content: items } : { type: "bulletList", content: items }, next: i };
}

export function linesToEditor(lines: SourceLine[]): PmNode[] {
  const out: PmNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    if (isList(l)) {
      const r = list(lines, i, l.indent ?? 0);
      out.push(r.node);
      i = r.next;
      continue;
    }
    i++;
    if (l.kind === "heading") out.push({ type: "heading", attrs: { level: (l.level ?? 1) <= 1 ? 2 : 3 }, content: runsToEditor(l.runs) });
    else if (l.kind === "hr") out.push({ type: "horizontalRule" });
    else if (l.kind === "quote") {
      const ps = [para(l.runs)];
      while (i < lines.length && lines[i].kind === "quote") ps.push(para(lines[i++].runs));
      out.push({ type: "blockquote", content: ps });
    } else if (l.runs.length) out.push(para(l.runs));
  }
  return out;
}
