#!/usr/bin/env node
// Bundles the browser-side enhancement scripts that need npm packages (src/client/*)
// into public/scripts/*.js (generated, git-ignored). Runs before `next build`.
import { build } from "esbuild";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENTRIES = { compose: "src/client/compose/index.ts" };

for (const [name, entry] of Object.entries(ENTRIES)) {
  await build({
    entryPoints: [path.join(ROOT, entry)],
    outfile: path.join(ROOT, "public", "scripts", `${name}.js`),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["es2020"],
    minify: true,
    legalComments: "eof",
    logLevel: "warning",
  });
  console.log(`built public/scripts/${name}.js`);
}
