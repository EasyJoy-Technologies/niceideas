import type { Editor } from "@tiptap/core";
import { createEditor } from "./editor";
import { kindOf, MediaStore, type MediaKind } from "./media";
import { composeFormData, postCompose, type ComposeMode } from "./submit";
import { bindToolbar } from "./toolbar";
import { Tray } from "./tray";

/**
 * Compose box enhancement (/scripts/compose.js, loaded only with the compose box).
 * Short post: media as thumbnails under the text. Article: title row, media at the cursor.
 * Labels and limits come from data-* attributes (src/server/share/compose-box.ts).
 */
const camel = (code: string) => code.split("_").map((p) => p[0].toUpperCase() + p.slice(1)).join("");

function editorMedia(editor: Editor): { ids: string[]; ranges: [number, number][] } {
  const ids: string[] = [];
  const ranges: [number, number][] = [];
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name !== "image" && n.type.name !== "audio") return true;
    ids.push(String(n.attrs.ref));
    ranges.push([pos, pos + n.nodeSize]);
    return false;
  });
  return { ids, ranges };
}

function setup(form: HTMLFormElement): void {
  const d = form.dataset;
  const q = <T extends Element>(sel: string) => form.querySelector<T>(sel);
  const host = q<HTMLElement>("[data-compose-editor]");
  const trayEl = q<HTMLElement>("[data-compose-tray]");
  const textarea = q<HTMLTextAreaElement>("textarea[name=text]");
  const title = q<HTMLInputElement>("input[name=title]");
  const errEl = q<HTMLElement>("[data-compose-err]");
  const count = q<HTMLElement>("[data-compose-count]");
  const submit = q<HTMLButtonElement>("button[type=submit]");
  if (!host || !trayEl || !textarea || !title || !errEl || !count || !submit) return;

  const store = new MediaStore();
  const shortMax = Number(d.shortMax) || 500;
  const max: Record<MediaKind, number> = { image: Number(d.maxImages) || 10, audio: Number(d.maxAudios) || 10 };
  const mode = (): ComposeMode => (q<HTMLInputElement>("input[name=mode]:checked")?.value === "long" ? "long" : "short");
  const showError = (code: string | null) => {
    errEl.textContent = code ? (d[`err${camel(code)}`] ?? d.errFailed ?? "") : "";
    errEl.hidden = !code;
  };

  const textLength = () => Array.from(editor.getText({ blockSeparator: "\n" }).trim()).length;
  const updateCount = () => {
    const n = textLength();
    count.hidden = mode() !== "short" || n < shortMax - 50;
    count.textContent = `${n} / ${shortMax}`;
    count.classList.toggle("ni-over", n > shortMax);
  };
  const tray = new Tray(trayEl, store, d.removeLabel ?? "", updateCount);
  const used = (kind: MediaKind) => tray.count(kind) + editorMedia(editor).ids.filter((id) => store.get(id)?.kind === kind).length;

  const addFiles = (files: File[]) => {
    showError(null);
    const nodes: { type: MediaKind; attrs: { ref: string } }[] = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) {
        showError("unsupported");
        continue;
      }
      if (used(kind) + nodes.filter((n) => n.type === kind).length >= max[kind]) {
        showError("too_much");
        continue;
      }
      nodes.push({ type: kind, attrs: { ref: store.add(file, kind).id } });
    }
    if (!nodes.length) return;
    if (mode() === "short") tray.add(nodes.map((n) => n.attrs.ref));
    else editor.chain().focus().insertContent(nodes).run();
  };

  // Declared after the helpers above, which only run once the editor exists.
  const editor: Editor = createEditor(host, {
    placeholder: textarea.placeholder,
    removeLabel: d.removeLabel ?? "",
    store,
    initial: textarea.value,
    onFiles: addFiles,
    onSubmitKey: () => form.requestSubmit(),
  });
  textarea.disabled = true;
  form.classList.add("ni-compose-js");
  editor.on("update", () => {
    showError(null);
    updateCount();
  });

  for (const input of form.querySelectorAll<HTMLInputElement>("input[type=file]")) {
    input.addEventListener("change", () => {
      addFiles(Array.from(input.files ?? []));
      input.value = "";
    });
  }

  // Short ⇄ article: media moves between the tray (after the text) and the editor (end of the text).
  for (const radio of form.querySelectorAll<HTMLInputElement>("input[name=mode]")) {
    radio.addEventListener("change", () => {
      if (mode() === "long") {
        const ids = tray.take();
        if (ids.length) editor.chain().focus("end").insertContent(ids.map((id) => ({ type: store.get(id)!.kind, attrs: { ref: id } }))).run();
      } else {
        const { ids, ranges } = editorMedia(editor);
        if (ids.length) {
          const tr = editor.state.tr;
          for (const [from, to] of ranges.reverse()) tr.delete(from, to);
          editor.view.dispatch(tr);
          tray.add(ids);
        }
      }
      form.querySelector("details.ni-tb-more")?.removeAttribute("open");
      showError(null);
      updateCount();
    });
  }

  bindToolbar(form, editor, d.linkPrompt ?? "");

  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const m = mode();
    if (editor.isEmpty && !tray.list().length && !editorMedia(editor).ids.length) return showError("empty");
    if (m === "short" && textLength() > shortMax) return showError("short_too_long");
    busy = true;
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = d.posting ?? label;
    const extra = m === "short" ? tray.list().map((id) => ({ type: store.get(id)!.kind, attrs: { ref: id } })) : [];
    const res = await postCompose(form.action, composeFormData(editor.getJSON(), extra, store, m, title.value));
    if (res.ok) {
      window.location.assign(res.url);
      return;
    }
    busy = false;
    submit.disabled = false;
    submit.textContent = label;
    showError(res.error);
  });
  updateCount();
}

for (const form of document.querySelectorAll<HTMLFormElement>("form.ni-compose")) setup(form);
