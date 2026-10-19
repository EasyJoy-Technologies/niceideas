import type { PostSource } from "@/server/db/schema";

export type FirstPartyPolicy = {
  /** Business audience → publication source. */
  audiences: ReadonlyMap<string, PostSource>;
  clientIds: ReadonlySet<string>;
};

const ALLOWED_SOURCES: ReadonlySet<string> = new Set(["nicenote_intl", "nicenote_cn"]);

/** Parses `aud=source,aud=source` and a comma-separated client id list. */
export function parseFirstPartyPolicy(audiences: string, clientIds: string): FirstPartyPolicy {
  const map = new Map<string, PostSource>();
  for (const pair of audiences.split(",").map((p) => p.trim()).filter(Boolean)) {
    const idx = pair.lastIndexOf("=");
    const aud = pair.slice(0, idx).trim();
    const source = pair.slice(idx + 1).trim();
    if (idx <= 0 || !ALLOWED_SOURCES.has(source)) throw new Error(`Invalid FIRST_PARTY_AUDIENCES entry: ${pair}`);
    map.set(aud, source as PostSource);
  }
  const ids = new Set(clientIds.split(",").map((s) => s.trim()).filter(Boolean));
  return { audiences: map, clientIds: ids };
}
