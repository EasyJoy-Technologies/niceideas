import { Node } from "@tiptap/core";

/**
 * Media of the compose box: files picked here (kept in the browser until Post, sent as `media`
 * files referenced by index from the editor JSON; previews use blob: URLs), or, when editing, the
 * post's stored media (sent back by id with their kept details; previews from the public store).
 */
export type MediaKind = "image" | "audio";
export type StoredMedia = { mediaId: string; url: string; meta?: Record<string, string> };
export type MediaEntry = { id: string; kind: MediaKind; url: string } & ({ file: File; stored?: undefined } | { file?: undefined; stored: StoredMedia });

const CLOSE = '<svg class="ni-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const MUSIC = '<svg class="ni-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
const AUDIO_EXT = /\.(m4a|mp3|aac|ogg|opus)$/i;

export function kindOf(file: File): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/") || AUDIO_EXT.test(file.name)) return "audio";
  return null;
}

export class MediaStore {
  private entries = new Map<string, MediaEntry>();
  private seq = 0;

  add(file: File, kind: MediaKind): MediaEntry {
    const entry: MediaEntry = { id: `m${++this.seq}`, kind, file, url: URL.createObjectURL(file) };
    this.entries.set(entry.id, entry);
    return entry;
  }

  addStored(stored: StoredMedia, kind: MediaKind): MediaEntry {
    const entry: MediaEntry = { id: `m${++this.seq}`, kind, url: stored.url, stored };
    this.entries.set(entry.id, entry);
    return entry;
  }

  get(id: unknown): MediaEntry | undefined {
    return typeof id === "string" ? this.entries.get(id) : undefined;
  }
}

/** Preview of one picked file (image, or audio bar with a player) with a remove button. */
export function mediaPreview(entry: MediaEntry | undefined, removeLabel: string, onRemove: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = `ni-media ${entry?.kind === "audio" ? "ni-media-aud" : "ni-media-img"}`;
  if (entry?.kind === "image") {
    const img = document.createElement("img");
    img.src = entry.url;
    img.alt = "";
    box.append(img);
  } else if (entry) {
    box.insertAdjacentHTML("beforeend", MUSIC);
    const name = document.createElement("span");
    name.textContent = entry.file?.name ?? "";
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = entry.url;
    box.append(name, audio);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.className = "ni-media-x";
  x.title = removeLabel;
  x.setAttribute("aria-label", removeLabel);
  x.innerHTML = CLOSE;
  x.addEventListener("click", (e) => {
    e.preventDefault();
    onRemove();
  });
  box.append(x);
  return box;
}

/** Block atom node (`image` / `audio`) pointing at a MediaStore entry. */
export function mediaNode(kind: MediaKind, store: MediaStore, removeLabel: string) {
  return Node.create({
    name: kind,
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return { ref: { default: null, rendered: false } };
    },
    parseHTML() {
      return [];
    },
    renderHTML() {
      return ["div", { "data-ni-media": kind }];
    },
    addNodeView() {
      return ({ node, getPos, editor }) => {
        const dom = mediaPreview(store.get(node.attrs.ref), removeLabel, () => {
          const pos = getPos();
          if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
        });
        dom.contentEditable = "false";
        return { dom };
      };
    },
  });
}
