import { getConfig } from "@/server/config/env";
import type { Locale } from "@/i18n/locales";
import type { SourceAppNames } from "@/server/db/schema";

/**
 * Our own apps that share through the NiceMatrix backend, by product group key (contract niceideas-share.md
 * §3.2 `sourceApp.key`): icon (copied from the NiceMatrix admin app icon) and website. Order = admin order.
 * Names shown on posts come from the post itself; `common.brand.<key>` names the app in the admin.
 */
export const SOURCE_APPS = {
  nicenote: { icon: "/brand/sources/nicenote.png", website: () => getConfig().SOURCE_NICENOTE_URL },
  nicerecorder: { icon: "/brand/sources/nicerecorder.png", website: () => getConfig().SOURCE_NICERECORDER_URL },
  nicelist: { icon: "/brand/sources/nicelist.png", website: () => getConfig().SOURCE_NICELIST_URL },
} as const;

export type SourceAppKey = keyof typeof SOURCE_APPS;
export const SOURCE_APP_KEYS = Object.keys(SOURCE_APPS) as SourceAppKey[];
export const isSourceAppKey = (key: string | null): key is SourceAppKey => !!key && Object.hasOwn(SOURCE_APPS, key);

/** Simplified / Traditional Chinese pages show that name when sent; every other language shows English. */
export function sourceAppName(names: SourceAppNames, locale: Locale): string {
  return (locale === "zh-Hans" || locale === "zh-Hant" ? names[locale] : undefined) ?? names.en;
}
