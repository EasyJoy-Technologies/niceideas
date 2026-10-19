#!/usr/bin/env node
// Merges a translation batch into messages/*.json.
// Usage: node scripts/i18n-merge.mjs <batch.json>
// Batch format: { "ns.section.key": { "en": "…", "zh-Hans": "…", … } }
// Every key in the batch must carry a value for EVERY registered locale.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { MESSAGES_DIR, registeredLocales, readMessages, writeMessages, setDeep } from "./lib/messages.mjs";

const batchPath = process.argv[2];
if (!batchPath) {
  console.error("usage: node scripts/i18n-merge.mjs <batch.json>");
  process.exit(2);
}
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
const locales = registeredLocales();

const problems = [];
for (const [key, values] of Object.entries(batch)) {
  for (const locale of locales) {
    if (typeof values[locale] !== "string" || values[locale].trim() === "") {
      problems.push(`${key}: missing ${locale}`);
    }
  }
  for (const locale of Object.keys(values)) {
    if (!locales.includes(locale)) problems.push(`${key}: unknown locale ${locale}`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

for (const locale of locales) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const messages = existsSync(file) ? readMessages(locale) : {};
  for (const [key, values] of Object.entries(batch)) setDeep(messages, key, values[locale]);
  writeMessages(locale, messages);
}
console.log(`merged ${Object.keys(batch).length} keys into ${locales.length} locales`);
