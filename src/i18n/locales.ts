/**
 * Supported UI locales (platform plan §7.1). Adding a locale = add
 * `messages/<code>.json` + register it here; no other code changes.
 */
export const LOCALES = [
  "zh-Hans", "zh-Hant",
  "en", "es", "fr", "ar", "pt-BR", "pt-PT", "ru",
  "de", "it", "nl", "pl", "uk", "ro", "cs", "hu", "el", "sv", "tr",
  "ja", "ko", "id", "ms", "fil", "th", "vi", "my", "km",
  "hi", "bn", "ur", "ne", "fa", "he", "uz", "kk",
  "sw", "am", "ha",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Locales written right-to-left; layout mirrors via `dir`. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar", "fa", "he", "ur"]);

/** Cookie remembering a manual language choice. */
export const LOCALE_COOKIE = "ni_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
