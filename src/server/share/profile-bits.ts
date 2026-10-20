import { escapeHtml } from "@/server/render/escape";

/** Public profile URL path (`/@handle`, rewritten to /u/<handle> by src/proxy.ts). */
export const profilePath = (handle: string) => `/@${handle}`;

/** Avatar image, or the first letter of the name on a tinted disc. */
export function avatarHtml(name: string, url: string | null, size: number, cls = "ni-avatar"): string {
  const style = `ni-av-${size}`;
  if (url) return `<img class="${cls} ${style}" src="${escapeHtml(url)}" width="${size}" height="${size}" alt="">`;
  const letter = Array.from(name.replace(/^@/, ""))[0]?.toUpperCase() ?? "";
  return `<span class="${cls} ${style}" aria-hidden="true">${escapeHtml(letter)}</span>`;
}
