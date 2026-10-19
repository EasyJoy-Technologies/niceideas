import { getTranslations } from "next-intl/server";
import { APP_VERSION } from "@/server/version";
import { GLOSSARY } from "@/i18n/glossary";

/** Minimal footer: brand + running version (platform plan §15). */
export async function SiteFooter() {
  const t = await getTranslations("common.footer");
  return (
    <footer className="mt-auto px-6 py-8 text-center text-sm text-ink-muted">
      <span className="font-semibold text-ink">{GLOSSARY.brand}</span>
      <span aria-hidden="true" className="mx-2 inline-block size-1 rounded-full bg-current align-middle" />
      <span>{t("version", { version: APP_VERSION })}</span>
    </footer>
  );
}
