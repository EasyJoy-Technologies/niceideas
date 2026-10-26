/**
 * Static information pages linked from the footer. Text lives in messages under
 * `info.<page>.*`; each page lists its paragraph / item keys in display order.
 */
export const INFO_PAGES = ["about", "terms", "privacy", "help"] as const;
export type InfoPage = (typeof INFO_PAGES)[number];

export type InfoSection = { kind: "p"; key: string } | { kind: "list"; keys: string[] } | { kind: "qa"; q: string; a: string };

const p = (key: string): InfoSection => ({ kind: "p", key });
const qa = (n: number): InfoSection => ({ kind: "qa", q: `q${n}`, a: `a${n}` });

export const INFO_LAYOUT: Record<InfoPage, InfoSection[]> = {
  about: [p("p1"), p("p2"), p("p3")],
  // Full text in content/legal (src/server/legal/legal-docs.ts).
  terms: [],
  privacy: [],
  help: [qa(1), qa(2), qa(3), qa(4)],
};
