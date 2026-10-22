import { Editor, type JSONContent } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import { mediaNode, type MediaStore } from "./media";

export type EditorOptions = {
  placeholder: string;
  removeLabel: string;
  store: MediaStore;
  /** Text typed into the no-JS textarea before the script loaded. */
  initial: string;
  onFiles: (files: File[]) => void;
  onSubmitKey: () => void;
};

function initialDoc(text: string): JSONContent {
  // One paragraph per non-empty line (blank lines in a textarea only separate paragraphs).
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  return { type: "doc", content: lines.map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] })) };
}

/** Rich editor of the compose box (Tiptap; no injected CSS: the page CSP allows same-origin styles only). */
export function createEditor(host: HTMLElement, o: EditorOptions): Editor {
  const take = (files: FileList | null | undefined) => {
    if (!files?.length) return false;
    o.onFiles(Array.from(files));
    return true;
  };
  return new Editor({
    element: host,
    injectCSS: false,
    content: o.initial ? initialDoc(o.initial) : "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder: o.placeholder }),
      mediaNode("image", o.store, o.removeLabel),
      mediaNode("audio", o.store, o.removeLabel),
    ],
    editorProps: {
      attributes: { class: "ni-ed", role: "textbox", "aria-multiline": "true", "aria-label": o.placeholder },
      handlePaste: (_view, event) => take(event.clipboardData?.files),
      handleDrop: (_view, event) => take((event as DragEvent).dataTransfer?.files),
      handleKeyDown: (_view, event) => {
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return false;
        o.onSubmitKey();
        return true;
      },
    },
  });
}
