import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/** Legacy / alias language subtags mapped to the canonical supported code. */
const LANGUAGE_ALIASES: Readonly<Record<string, Locale>> = {
  tl: "fil",
  in: "id",
  iw: "he",
  zsm: "ms",
};

/** Portuguese regions that follow the European norm. */
const PT_EUROPEAN_REGIONS = new Set(["PT", "AO", "MZ", "CV", "GW", "ST", "TL", "MO", "LU", "CH"]);
/** Chinese regions conventionally using Traditional script. */
const ZH_TRADITIONAL_REGIONS = new Set(["TW", "HK", "MO"]);

type Range = { tag: string; q: number; order: number };

function parseAcceptLanguage(header: string): Range[] {
  return header
    .split(",")
    .map((part, order) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag: rawTag.trim(), q: Number.isFinite(q) ? q : 0, order };
    })
    .filter((r) => r.tag !== "" && r.tag !== "*" && r.q > 0)
    .sort((a, b) => b.q - a.q || a.order - b.order);
}

/** Maps one BCP-47 tag to a supported locale, or null when unsupported. */
export function matchLocaleTag(tag: string): Locale | null {
  let parsed: Intl.Locale;
  try {
    parsed = new Intl.Locale(tag);
  } catch {
    return null;
  }
  const language = parsed.language.toLowerCase();
  const region = parsed.region?.toUpperCase();
  const script = parsed.script;

  if (language === "zh") {
    if (script === "Hant") return "zh-Hant";
    if (script === "Hans") return "zh-Hans";
    return region && ZH_TRADITIONAL_REGIONS.has(region) ? "zh-Hant" : "zh-Hans";
  }
  if (language === "pt") {
    return region && PT_EUROPEAN_REGIONS.has(region) ? "pt-PT" : "pt-BR";
  }
  const alias = LANGUAGE_ALIASES[language];
  if (alias) return alias;
  return isLocale(language) ? language : null;
}

/** Picks the best supported locale for an `Accept-Language` header value. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const range of parseAcceptLanguage(acceptLanguage)) {
    const match = matchLocaleTag(range.tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

