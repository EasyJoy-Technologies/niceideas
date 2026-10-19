import { createHash } from "node:crypto";

/** Canonical JSON: object keys sorted recursively, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** content_hash of a normalized document (identical content → identical hash). */
export function contentHash(doc: unknown): string {
  return createHash("sha256").update(canonicalJson(doc)).digest("hex");
}
