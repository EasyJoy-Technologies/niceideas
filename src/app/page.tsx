import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { GLOSSARY } from "@/i18n/glossary";

export default async function HomePage() {
  await connection();
  const t = await getTranslations("home.landing");
  const common = await getTranslations("common");
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <p className="mb-6 text-sm font-semibold tracking-wide text-primary">{GLOSSARY.brand}</p>
        <h1 className="text-4xl font-bold leading-tight text-ink sm:text-[2.75rem]">{t("title")}</h1>
        <p className="mt-4 text-lg text-ink-muted">{common("tagline")}</p>
        <div className="mt-10 rounded-lg bg-surface p-6 shadow-card">
          <p className="text-base text-ink">{t("comingSoon")}</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
