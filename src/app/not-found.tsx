import { getTranslations } from "next-intl/server";
import { StatusMessage } from "@/components/layout/status-message";

export default async function NotFound() {
  const t = await getTranslations("status.notFound");
  return <StatusMessage title={t("title")} body={t("body")} />;
}
