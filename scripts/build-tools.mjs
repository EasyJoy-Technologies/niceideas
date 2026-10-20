#!/usr/bin/env node
// Bundles server-side CLIs (migrations, internal tools) into dist/*.mjs so the
// deploy directory needs no TypeScript toolchain. Run after `next build`.
import { build } from "esbuild";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const RUNTIME_EXTERNALS = ["sharp", "file-type", "music-metadata"];
const ENTRIES = { migrate: "scripts/migrate.ts", publish: "scripts/publish.ts" };

for (const [name, entry] of Object.entries(ENTRIES)) {
  await build({
    entryPoints: [path.join(ROOT, entry)],
    outfile: path.join(ROOT, "dist", `${name}.mjs`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    alias: { "@": path.join(ROOT, "src") },
    // Native / optional modules resolved from the standalone node_modules at runtime.
    external: ["pg-native", "sharp"],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "warning",
  });
  console.log(`built dist/${name}.mjs`);
}
