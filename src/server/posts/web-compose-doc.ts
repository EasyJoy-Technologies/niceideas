import { z } from "zod";
import type { DocBlock } from "@/server/documents/schema";
import { badRequest } from "@/server/http/errors";
import { blockMarkdown, itemText, type PmMark, type PmNode } from "./editor-markdown";

/** Upper bound of the serialized editor document (a 20,000-char post is far below this). */
export const EDITOR_DOC_MAX_CHARS = 1_000_000;
const MAX_DEPTH = 24;

/** A document block, or an uploaded file (form field `media`, by index) placed at this position. */
export type DraftBlock = DocBlock | { type: "media"; kind: "image" | "audio"; file: number };

const mark: z.ZodType<PmMark> = z.object({ type: z.string().max(40), attrs: z.record(z.string(), z.unknown()).optional() });
const node: z.ZodType<PmNode> = z.lazy(() =>
  z.object({
    type: z.string().max(40),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(node).max(5_000).optional(),
    text: z.string().optional(),
    marks: z.array(mark).max(10).optional(),
  }),
);

function tooDeep(v: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(v)) return v.some((x) => tooDeep(x, depth + 1));
  if (v && typeof v === "object") return Object.values(v).some((x) => tooDeep(x, depth + 1));
  return false;
}

/**
 * Editor document (JSON) → draft blocks: consecutive text becomes one Markdown block,
 * top-level checklists become to-do blocks, image / audio nodes keep their position.
 */
export function editorBlocks(json: string): DraftBlock[] {
  if (json.length > EDITOR_DOC_MAX_CHARS) throw badRequest("compose.too_much");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw badRequest("compose.invalid");
  }
  if (tooDeep(raw, 0)) throw badRequest("compose.invalid");
  const parsed = node.safeParse(raw);
  if (!parsed.success || parsed.data.type !== "doc") throw badRequest("compose.invalid");

  const out: DraftBlock[] = [];
  let md: string[] = [];
  const flush = () => {
    const text = md.join("\n\n").trim();
    if (text) out.push({ type: "text", format: "markdown", text });
    md = [];
  };
  const media = (n: PmNode) => {
    const file = n.attrs?.file;
    if (typeof file !== "number" || !Number.isInteger(file) || file < 0) throw badRequest("compose.invalid");
    flush();
    out.push({ type: "media", kind: n.type === "audio" ? "audio" : "image", file });
  };
  for (const n of parsed.data.content ?? []) {
    if (n.type === "image" || n.type === "audio") {
      media(n);
      continue;
    }
    if (n.type === "taskList") {
      const items = (n.content ?? []).map((i) => ({ text: itemText(i).slice(0, 2_000), checked: i.attrs?.checked === true })).filter((i) => i.text);
      if (items.length) {
        flush();
        out.push({ type: "todo", items });
      }
      continue;
    }
    const hoisted: PmNode[] = [];
    const text = blockMarkdown(n, (m) => hoisted.push(m));
    if (text) md.push(text);
    hoisted.forEach(media);
  }
  flush();
  return out;
}
