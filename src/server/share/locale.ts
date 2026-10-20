import { createFormatter, createTranslator, type AbstractIntlMessages } from "next-intl";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/resolve";

/** Query parameter that renders a share page in another language (no cookie, no redirect). */
export const LANG_PARAM = "hl";

function cookieValue(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Visitor language for server-rendered pages: `?hl` → cookie → Accept-Language → default. */
export function requestLocale(request: Request): Locale {
  const explicit = new URL(request.url).searchParams.get(LANG_PARAM);
  if (isLocale(explicit)) return explicit;
  return resolveLocale({
    cookieLocale: cookieValue(request.headers.get("cookie"), LOCALE_COOKIE),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

/** Message lookup by full dotted key; ICU values are plain strings / numbers. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export type PageIntl = {
  locale: Locale;
  t: Translate;
  format: ReturnType<typeof createFormatter>;
};

/** Translator + formatter outside React (Route Handlers render plain HTML). */
export async function pageIntl(locale: Locale): Promise<PageIntl> {
  const messages: AbstractIntlMessages = await loadMessages(locale);
  const translator = createTranslator({ locale, messages });
  // Keys are checked by `check:i18n` and tests; the catalogue type is untyped JSON here.
  const t: Translate = (key, values) => (translator as unknown as Translate)(key, values);
  return {
    locale,
    t,
    // Server output never depends on the host zone; the page script re-renders times in the visitor's zone.
    format: createFormatter({ locale, timeZone: "UTC" }),
  };
}
