import type { Locale } from "@/i18n/locales";
import type { SourceAppNames } from "@/server/db/schema";

/** Simplified / Traditional Chinese pages show that name when sent; every other language shows English. */
export function sourceAppName(names: SourceAppNames, locale: Locale): string {
  return (locale === "zh-Hans" || locale === "zh-Hant" ? names[locale] : undefined) ?? names.en;
}
