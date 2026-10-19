import type { AbstractIntlMessages } from "next-intl";
import type { Locale } from "./locales";

/** Loads the message catalogue for one locale (bundled per locale by the build). */
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  return (await import(`../../messages/${locale}.json`)).default as AbstractIntlMessages;
}
