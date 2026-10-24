#!/usr/bin/env node
// Bundles the browser-side enhancement scripts that need npm packages (src/client/*)
// into public/scripts/*.js, and copies their vendor styles into public/styles (generated,
// git-ignored). Runs before `next build`.
import { build } from "esbuild";
import { copyFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENTRIES = { compose: "src/client/compose/index.ts", viewer: "src/client/viewer/index.ts" };
const VENDOR_STYLES = { "photoswipe.css": "node_modules/photoswipe/dist/photoswipe.css" };

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
for (const [name, file] of Object.entries(VENDOR_STYLES)) {
  copyFileSync(path.join(ROOT, file), path.join(ROOT, "public", "styles", name));
  console.log(`copied public/styles/${name}`);
}
