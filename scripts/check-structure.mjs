#!/usr/bin/env node
// Code discipline gate: source files ≤ 300 lines; no CJK literals in source
// (user-facing text must live in messages/*.json).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCAN_DIRS = ["src", "scripts"];
const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".sql"]);
const MAX_LINES = 300;
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

const errors = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (EXT.has(path.extname(name))) check(full);
  }
}
function check(file) {
  const rel = path.relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  if (lines.length > MAX_LINES) errors.push(`${rel}: ${lines.length} lines (max ${MAX_LINES}) — split it`);
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (CJK.test(code) && !/^\s*(\*|\/\*)/.test(line)) errors.push(`${rel}:${i + 1}: CJK literal in source — use an i18n key`);
  });
}
for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("structure check passed");
