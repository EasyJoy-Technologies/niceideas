import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, LOCALE_COOKIE } from "./locales";
import { loadMessages } from "./messages";
import { resolveLocale } from "./resolve";

export default getRequestConfig(async ({ locale: explicit }) => {
  // Server code may pass an explicit locale, e.g. getTranslations({ locale }).
  const locale = isLocale(explicit)
    ? explicit
    : resolveLocale({
        cookieLocale: (await cookies()).get(LOCALE_COOKIE)?.value,
        acceptLanguage: (await headers()).get("accept-language"),
      });
  // Server output must not depend on the host time zone; visitors' zones are applied client-side.
  return { locale, timeZone: "UTC", messages: await loadMessages(locale) };
});
