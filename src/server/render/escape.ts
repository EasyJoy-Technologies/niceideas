const MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => MAP[c]);
}

/** Escapes text for Markdown (src/server/render/markdown.ts): it renders literally. */
export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>~|&])/g, "\\$1");
}

/** Plain text → paragraphs; single newlines become <br>. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
