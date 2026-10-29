import { z } from "zod";
import type { SourceAppNames } from "@/server/db/schema";

/** `sourceApp` of POST /posts (contract niceideas-share.md §3.2): the product group a share came from. */
export type SourceApp = { key: string; names: SourceAppNames };

const name = z.string().trim().min(1).max(100);
const sourceAppSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  // English is the name shown in every language except Simplified / Traditional Chinese, so it is required.
  // Other locale keys are ignored.
  names: z.object({ en: name, "zh-Hans": name.optional(), "zh-Hant": name.optional() }),
});

/**
 * Accepted only when complete and valid; anything else (absent, null, wrong shape) gives null: the post then
 * records no source app and shows no "From …" badge. Never fails the request.
 */
export function parseSourceApp(raw: unknown): SourceApp | null {
  const r = sourceAppSchema.safeParse(raw);
  if (!r.success) return null;
  const { en, "zh-Hans": hans, "zh-Hant": hant } = r.data.names;
  return { key: r.data.key, names: { en, ...(hans ? { "zh-Hans": hans } : {}), ...(hant ? { "zh-Hant": hant } : {}) } };
}
