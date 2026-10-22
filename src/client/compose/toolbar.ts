import type { ChainedCommands, Editor } from "@tiptap/core";

/** Toolbar buttons (`data-cmd`, rendered by src/server/share/compose-toolbar.ts) → editor commands. */
type Cmd = { run: (c: ChainedCommands) => ChainedCommands; active?: [string, Record<string, unknown>?] };

const CMDS: Record<string, Cmd> = {
  heading: { run: (c) => c.toggleHeading({ level: 2 }), active: ["heading", { level: 2 }] },
  heading3: { run: (c) => c.toggleHeading({ level: 3 }), active: ["heading", { level: 3 }] },
  bold: { run: (c) => c.toggleBold(), active: ["bold"] },
  italic: { run: (c) => c.toggleItalic(), active: ["italic"] },
  strike: { run: (c) => c.toggleStrike(), active: ["strike"] },
  code: { run: (c) => c.toggleCode(), active: ["code"] },
  bulletList: { run: (c) => c.toggleBulletList(), active: ["bulletList"] },
  orderedList: { run: (c) => c.toggleOrderedList(), active: ["orderedList"] },
  taskList: { run: (c) => c.toggleTaskList(), active: ["taskList"] },
  quote: { run: (c) => c.toggleBlockquote(), active: ["blockquote"] },
  codeBlock: { run: (c) => c.toggleCodeBlock(), active: ["codeBlock"] },
  divider: { run: (c) => c.setHorizontalRule() },
};

const SAFE = /^(https?:\/\/|mailto:)/i;

function setLink(editor: Editor, prompt: string): void {
  const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
  const input = window.prompt(prompt, previous);
  if (input === null) return;
  const url = input.trim();
  const chain = editor.chain().focus().extendMarkRange("link");
  if (!url) {
    chain.unsetLink().run();
    return;
  }
  const href = SAFE.test(url) ? url : `https://${url}`;
  if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] }).run();
  else chain.setLink({ href }).run();
}

export function bindToolbar(form: HTMLFormElement, editor: Editor, linkPrompt: string): void {
  // Keep the editor selection when a toolbar button is pressed.
  form.addEventListener("mousedown", (e) => {
    if ((e.target as Element).closest("button[data-cmd]")) e.preventDefault();
  });
  form.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("button[data-cmd]");
    if (!btn) return;
    e.preventDefault();
    const name = btn.dataset.cmd ?? "";
    if (name === "link") setLink(editor, linkPrompt);
    else CMDS[name]?.run(editor.chain().focus()).run();
    btn.closest("details")?.removeAttribute("open");
  });
  const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>(".ni-tb[data-cmd]"));
  const refresh = () => {
    for (const b of buttons) {
      const name = b.dataset.cmd ?? "";
      const active = name === "link" ? (["link"] as const) : CMDS[name]?.active;
      b.setAttribute("aria-pressed", String(!!active && editor.isActive(active[0], active[1])));
    }
  };
  editor.on("transaction", refresh);
  refresh();
}
