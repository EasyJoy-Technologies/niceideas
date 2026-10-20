/**
 * Static information pages linked from the footer. Text lives in messages under
 * `info.<page>.*`; each page lists its paragraph / item keys in display order.
 */
export const INFO_PAGES = ["about", "guidelines", "terms", "privacy", "help"] as const;
export type InfoPage = (typeof INFO_PAGES)[number];

export type InfoSection = { kind: "p"; key: string } | { kind: "list"; keys: string[] } | { kind: "qa"; q: string; a: string };

const p = (key: string): InfoSection => ({ kind: "p", key });
const list = (...keys: string[]): InfoSection => ({ kind: "list", keys });
const qa = (n: number): InfoSection => ({ kind: "qa", q: `q${n}`, a: `a${n}` });

export const INFO_LAYOUT: Record<InfoPage, InfoSection[]> = {
  about: [p("p1"), p("p2"), p("p3")],
  guidelines: [p("intro"), list("item1", "item2", "item3", "item4"), p("outro")],
  terms: [list("item1", "item2", "item3", "item4", "item5")],
  privacy: [list("item1", "item2", "item3", "item4", "item5")],
  help: [qa(1), qa(2), qa(3), qa(4)],
};
