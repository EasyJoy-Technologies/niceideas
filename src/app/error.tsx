"use client";

import { useTranslations } from "next-intl";
import { StatusMessage } from "@/components/layout/status-message";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("status.error");
  return (
    <StatusMessage
      title={t("title")}
      body={t("body")}
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-ink-inverse transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("retry")}
        </button>
      }
    />
  );
}
