// Shared helpers for the i18n maintenance scripts (merge + check).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const MESSAGES_DIR = path.join(ROOT, "messages");
export const SOURCE_LOCALE = "en";

/** Locale codes registered in src/i18n/locales.ts (single source of truth). */
export function registeredLocales() {
  const src = readFileSync(path.join(ROOT, "src/i18n/locales.ts"), "utf8");
  const block = src.match(/export const LOCALES = \[([\s\S]*?)\] as const/);
  if (!block) throw new Error("Cannot find LOCALES in src/i18n/locales.ts");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export function messageFiles() {
  return readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length));
}

export function readMessages(locale) {
  return JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

export function writeMessages(locale, messages) {
  writeFileSync(path.join(MESSAGES_DIR, `${locale}.json`), JSON.stringify(sortDeep(messages), null, 2) + "\n");
}

/** Flattens nested messages into { "a.b.c": "text" }. */
export function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

export function setDeep(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let node = obj;
  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

function sortDeep(value) {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]),
  );
}
