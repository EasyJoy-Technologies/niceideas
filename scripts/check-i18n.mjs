#!/usr/bin/env node
// CI gate for translations (platform plan §7.2):
// - every registered locale has a file and every file is registered
// - identical key sets across locales
// - no empty values
// - ICU placeholders identical to the English source
// - no value identical to English unless allow-listed in messages/_identical.json
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { MESSAGES_DIR, SOURCE_LOCALE, registeredLocales, messageFiles, readMessages, flatten } from "./lib/messages.mjs";

const errors = [];
const locales = registeredLocales();
const files = messageFiles();

for (const l of locales) if (!files.includes(l)) errors.push(`missing messages/${l}.json`);
for (const f of files) if (!locales.includes(f)) errors.push(`messages/${f}.json is not registered in src/i18n/locales.ts`);

const identicalPath = path.join(MESSAGES_DIR, "_identical.json");
const identical = existsSync(identicalPath) ? JSON.parse(readFileSync(identicalPath, "utf8")) : {};

function placeholders(message, key, locale) {
  const names = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if ("value" in node && typeof node.value === "string" && node.type !== TYPE.literal) names.add(`${node.type}:${node.value}`);
      if (node.options) for (const opt of Object.values(node.options)) walk(opt.value);
      if (node.children) walk(node.children);
    }
  };
  try {
    walk(parse(message, { ignoreTag: false }));
  } catch (e) {
    errors.push(`${locale}: ${key} is not valid ICU (${e.message})`);
  }
  return [...names].sort().join(",");
}

const source = flatten(readMessages(SOURCE_LOCALE));
const sourceKeys = Object.keys(source).sort();

for (const locale of locales.filter((l) => files.includes(l))) {
  const flat = flatten(readMessages(locale));
  const keys = Object.keys(flat).sort();
  for (const k of sourceKeys) if (!(k in flat)) errors.push(`${locale}: missing key ${k}`);
  for (const k of keys) if (!(k in source)) errors.push(`${locale}: extra key ${k}`);
  for (const k of keys) {
    const value = flat[k];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${locale}: empty value ${k}`);
      continue;
    }
    if (!(k in source)) continue;
    if (placeholders(value, k, locale) !== placeholders(source[k], k, SOURCE_LOCALE)) {
      errors.push(`${locale}: placeholder mismatch in ${k}`);
    }
    const allowed = identical[k] ?? [];
    if (locale !== SOURCE_LOCALE && value === source[k] && !allowed.includes(locale)) {
      errors.push(`${locale}: ${k} is identical to English (untranslated?) — translate or allow-list in messages/_identical.json`);
    }
  }
}

for (const [k, allowed] of Object.entries(identical)) {
  if (!(k in source)) errors.push(`_identical.json lists unknown key ${k}`);
  for (const l of allowed) if (!locales.includes(l)) errors.push(`_identical.json lists unknown locale ${l} for ${k}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\ni18n check FAILED (${errors.length} problems)`);
  process.exit(1);
}
console.log(`i18n check passed: ${locales.length} locales × ${sourceKeys.length} keys`);
