import type { JSONContent } from "@tiptap/core";
import type { MediaStore } from "./media";

export type ComposeMode = "short" | "long";
export type SubmitResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Builds the multipart body: `doc` (editor JSON, media nodes carry `file` = index into
 * the `media` files; stored media of an edited post carry their id), `mode`, `title` (article only),
 * plus `fields` (editing: the post's slug). A media entry is sent once.
 */
export function composeFormData(doc: JSONContent, extra: JSONContent[], store: MediaStore, mode: ComposeMode, title: string, fields: [string, string][] = []): FormData {
  const files: File[] = [];
  const used = new Set<string>();
  const map = (nodes?: JSONContent[]): JSONContent[] | undefined =>
    nodes?.flatMap((n): JSONContent[] => {
      if (n.type !== "image" && n.type !== "audio") return [{ ...n, content: map(n.content) }];
      const entry = store.get(n.attrs?.ref);
      if (!entry || used.has(entry.id)) return [];
      used.add(entry.id);
      if (entry.stored) return [{ type: n.type, attrs: { mediaId: entry.stored.mediaId, meta: entry.stored.meta ?? {} } }];
      files.push(entry.file);
      return [{ type: n.type, attrs: { file: files.length - 1 } }];
    });
  const json = { type: "doc", content: map([...(doc.content ?? []), ...extra]) };
  const fd = new FormData();
  for (const [k, v] of fields) fd.set(k, v);
  fd.set("mode", mode);
  if (mode === "long" && title.trim()) fd.set("title", title.trim());
  fd.set("doc", JSON.stringify(json));
  for (const f of files) fd.append("media", f, f.name);
  return fd;
}

/** Posts the form; the server answers with a redirect to the new post, or home with `?compose=<error>`. */
export async function postCompose(action: string, body: FormData): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch(action, { method: "POST", body, credentials: "same-origin" });
  } catch {
    return { ok: false, error: "failed" };
  }
  if (res.status === 413) return { ok: false, error: "too_large" };
  if (res.status === 429) return { ok: false, error: "rate_limited" };
  if (!res.ok) return { ok: false, error: "failed" };
  const url = new URL(res.url);
  const error = url.searchParams.get("compose");
  return error ? { ok: false, error } : { ok: true, url: res.url };
}
