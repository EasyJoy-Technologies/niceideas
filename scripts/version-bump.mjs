#!/usr/bin/env node
// Version rule (platform plan §15): A.B only by human instruction; C +1 per code commit.
//   node scripts/version-bump.mjs            → C + 1
//   node scripts/version-bump.mjs --set 1.1  → A.B = 1.1, C = 0 (only on explicit instruction)
// Creates changelog/v<version>.md from a template when missing; prints the new version.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);

let next;
const setIdx = process.argv.indexOf("--set");
if (setIdx !== -1) {
  const ab = process.argv[setIdx + 1] ?? "";
  if (!/^\d+\.\d+$/.test(ab)) {
    console.error("--set expects A.B, e.g. --set 1.1");
    process.exit(2);
  }
  next = `${ab}.0`;
} else {
  next = `${a}.${b}.${c + 1}`;
}

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const entry = path.join(ROOT, "changelog", `v${next}.md`);
if (!existsSync(entry)) {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    entry,
    `# v${next} — ${today}\n\n## Changes\n- \n\n## Database migrations\n- none\n\n## Deployed\n- not deployed\n`,
  );
}
console.log(next);
