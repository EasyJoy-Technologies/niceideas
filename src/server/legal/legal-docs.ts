import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { renderMarkdown } from "@/server/render/markdown";

/**
 * Terms of Use / Privacy Policy: full text per locale in `content/legal/<doc>/<locale>.md`
 * (copied next to the server on deploy). English is authoritative (Terms §16.4).
 * Format: a leading "> " summary, then "## N. Title" sections.
 */
export const LEGAL_DOCS = ["terms", "privacy"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

/** Effective date of the current versions (ISO date). Bump with every published change. */
export const LEGAL_EFFECTIVE_DATE = "2026-10-24";

export type LegalSection = { id: string; title: string; html: string };
export type LegalDocument = { summaryHtml: string; sections: LegalSection[] };

const cache = new Map<string, LegalDocument>();

export const legalDir = () => path.join(process.cwd(), "content", "legal");

export function isLegalDoc(page: string): page is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(page);
}

/** Parses one Markdown legal document into a summary and numbered sections. */
export function parseLegalMarkdown(source: string): LegalDocument {
  const parts = source.replace(/\r\n/g, "\n").split(/^## /m);
  const head = parts.shift() ?? "";
  const summary = head.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "")).join("\n");
  const sections = parts.map((part, i) => {
    const nl = part.indexOf("\n");
    const title = (nl < 0 ? part : part.slice(0, nl)).trim();
    return { id: `s${i + 1}`, title, html: renderMarkdown(nl < 0 ? "" : part.slice(nl + 1)) };
  });
  return { summaryHtml: renderMarkdown(summary), sections };
}

/** The document in `locale` (English if that translation is missing). */
export function loadLegalDocument(doc: LegalDoc, locale: Locale): LegalDocument {
  const key = `${doc}/${locale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let source: string;
  try {
    source = readFileSync(path.join(legalDir(), doc, `${locale}.md`), "utf8");
  } catch {
    source = readFileSync(path.join(legalDir(), doc, `${DEFAULT_LOCALE}.md`), "utf8");
  }
  const parsed = parseLegalMarkdown(source);
  cache.set(key, parsed);
  return parsed;
}
