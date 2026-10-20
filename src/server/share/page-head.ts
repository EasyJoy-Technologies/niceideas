import { GLOSSARY } from "@/i18n/glossary";
import { getConfig } from "@/server/config/env";
import { escapeHtml } from "@/server/render/escape";

export const siteUrl = (path: string) => `${getConfig().PUBLIC_BASE_URL.replace(/\/+$/, "")}${path}`;

const meta = (attr: string, key: string, content: string) => `<meta ${attr}="${key}" content="${escapeHtml(content)}">`;

/** Canonical link and basic share-card tags of a site page (post pages have their own, see post-page.ts). */
export function pageHead(p: { url: string; title: string; description: string; type: "website" | "profile"; image: string | null }): string {
  return [
    `<link rel="canonical" href="${escapeHtml(p.url)}">`,
    meta("name", "description", p.description),
    meta("property", "og:type", p.type),
    meta("property", "og:site_name", GLOSSARY.brand),
    meta("property", "og:url", p.url),
    meta("property", "og:title", p.title),
    meta("property", "og:description", p.description),
    meta("property", "og:image", p.image ?? siteUrl("/brand/og-default.png")),
    meta("name", "twitter:card", "summary"),
  ].join("");
}
