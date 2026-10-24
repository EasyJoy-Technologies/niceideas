import type { Media, MediaJobState } from "@/server/db/schema";
import type { SourceBlock, SourceDocument, SourceLine, SourceRun } from "@/server/documents/source-schema";
import { escapeHtml, plainTextToHtml } from "./escape";
import { audioFigure, imageFigure, mediaPlaceholder, type MediaUrl } from "./media-html";

type Opts = { jobs?: ReadonlyMap<string, MediaJobState>; labels?: { processing: string; unavailable: string } };
type ListTag = "ul" | "ol";

const LINK_ATTRS = 'rel="nofollow noopener noreferrer ugc" target="_blank"';

/** One run: text always escaped (newlines → <br>); code innermost, link outermost. */
function runHtml(r: SourceRun): string {
  let html = escapeHtml(r.text).replace(/\n/g, "<br>");
  if (r.code) html = `<code>${html}</code>`;
  if (r.strike) html = `<s>${html}</s>`;
  if (r.italic) html = `<em>${html}</em>`;
  if (r.bold) html = `<strong>${html}</strong>`;
  // Unsafe hrefs were dropped at validation; only http(s) / mailto reach here.
  if (r.href) html = `<a href="${escapeHtml(r.href)}" ${LINK_ATTRS}>${html}</a>`;
  return html;
}

const runsHtml = (runs: SourceRun[]) => runs.map(runHtml).join("");

/** Consecutive list lines → nested <ul>/<ol> by indent (a deeper list sits inside the previous item). */
function listsHtml(lines: SourceLine[]): string {
  let out = "";
  const stack: { tag: ListTag; indent: number }[] = [];
  for (const l of lines) {
    const tag: ListTag = l.kind === "ordered" ? "ol" : "ul";
    const indent = l.indent ?? 0;
    for (let top = stack.at(-1); top && (top.indent > indent || (top.indent === indent && top.tag !== tag)); top = stack.at(-1)) out += `</li></${stack.pop()!.tag}>`;
    const top = stack.at(-1);
    if (!top || top.indent < indent) {
      const start = tag === "ol" && l.number !== undefined && l.number !== 1 ? ` start="${l.number}"` : "";
      out += `<${tag}${start}>`;
      stack.push({ tag, indent });
    } else out += "</li>";
    out += `<li>${runsHtml(l.runs)}`;
  }
  while (stack.length) out += `</li></${stack.pop()!.tag}>`;
  return out;
}

const isList = (l: SourceLine) => l.kind === "bullet" || l.kind === "ordered";
const isText = (l: SourceLine) => l.kind === "paragraph" && l.runs.length > 0;

/**
 * Rich lines → HTML (contract niceideas-share.md §6): consecutive list lines form one list,
 * consecutive quote lines one quote, consecutive non-empty paragraph lines one paragraph
 * (an empty paragraph line separates paragraphs); headings move one level down (h1 = post title).
 */
function richHtml(lines: SourceLine[]): string {
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    const take = (pred: (x: SourceLine) => boolean) => {
      let j = i;
      while (j < lines.length && pred(lines[j])) j++;
      const group = lines.slice(i, j);
      i = j;
      return group;
    };
    if (isList(l)) out.push(listsHtml(take(isList)));
    else if (l.kind === "quote") out.push(`<blockquote><p>${take((x) => x.kind === "quote").map((x) => runsHtml(x.runs)).join("<br>")}</p></blockquote>`);
    else if (isText(l)) out.push(`<p>${take(isText).map((x) => runsHtml(x.runs)).join("<br>")}</p>`);
    else {
      i++;
      if (l.kind === "heading") out.push(`<h${Math.min((l.level ?? 1) + 1, 6)}>${runsHtml(l.runs)}</h${Math.min((l.level ?? 1) + 1, 6)}>`);
      else if (l.kind === "hr") out.push("<hr>");
    }
  }
  return out.join("");
}

function todoHtml(items: { checked: boolean; runs: SourceRun[] }[]): string {
  const li = items
    .map((i) => `<li class="ni-todo-item${i.checked ? " ni-done" : ""}"><label><input type="checkbox" disabled${i.checked ? " checked" : ""}><span>${runsHtml(i.runs)}</span></label></li>`)
    .join("");
  return `<ul class="ni-todo">${li}</ul>`;
}

function placeholder(kind: "image" | "audio", ref: string | null, opts: Opts): string {
  const failed = ref !== null && opts.jobs?.get(ref) === "failed";
  const state = failed ? "unavailable" : "processing";
  return mediaPlaceholder(kind, state, opts.labels?.[state] ?? "");
}

/** NiceNote share document → safe HTML. Media come from `media` by ref; others show a placeholder. */
export function renderSourceHtml(doc: SourceDocument, media: ReadonlyMap<string, Media>, publicUrl: MediaUrl, opts: Opts): string {
  let firstImage = true;
  const block = (b: SourceBlock): string => {
    switch (b.type) {
      case "text":
        return `<div class="ni-text">${plainTextToHtml(b.text)}</div>`;
      case "rich":
        return `<div class="ni-text">${richHtml(b.lines)}</div>`;
      case "todo":
        return todoHtml(b.items);
      case "image": {
        if (b.state !== "ready") return placeholder("image", null, opts);
        const html = imageFigure(media.get(b.ref), b, firstImage, publicUrl);
        if (html) firstImage = false;
        return html || placeholder("image", b.ref, opts);
      }
      case "audio":
        return b.state === "ready" ? audioFigure(media.get(b.ref), b.title, publicUrl) || placeholder("audio", b.ref, opts) : placeholder("audio", null, opts);
    }
  };
  return doc.blocks.map(block).join("\n");
}
