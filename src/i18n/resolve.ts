import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";
import { negotiateLocale } from "./negotiate";

export type LocaleSignals = {
  /** Explicit manual choice remembered in a cookie. */
  cookieLocale?: string | null;
  /** Signed-in user's profile preference (phase 2). */
  profileLocale?: string | null;
  acceptLanguage?: string | null;
};

/** Priority: manual choice → profile preference → browser languages → default. */
export function resolveLocale(signals: LocaleSignals): Locale {
  if (isLocale(signals.cookieLocale)) return signals.cookieLocale;
  if (isLocale(signals.profileLocale)) return signals.profileLocale;
  if (signals.acceptLanguage) return negotiateLocale(signals.acceptLanguage);
  return DEFAULT_LOCALE;
}
