import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { directionOf, isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { GLOSSARY } from "@/i18n/glossary";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.site");
  return {
    title: t("title", { brand: GLOSSARY.brand }),
    description: t("description"),
    applicationName: GLOSSARY.brand,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const current = await getLocale();
  const locale = isLocale(current) ? current : DEFAULT_LOCALE;
  // Ship only the namespaces client components need (keeps every page light).
  const { status } = await getMessages();
  return (
    <html lang={locale} dir={directionOf(locale)} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={{ status }}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
