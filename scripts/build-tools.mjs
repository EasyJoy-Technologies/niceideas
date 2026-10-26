#!/usr/bin/env node
// Bundles server-side CLIs (migrations, internal tools) into dist/*.mjs so the
// deploy directory needs no TypeScript toolchain. Run after `next build`.
import { build } from "esbuild";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
// Resolved at runtime from dist/node_modules (linked by deploy/deploy-staging.sh): native sharp, and
// file-type / music-metadata, which load `strtok3` through a runtime dynamic import a bundle cannot satisfy.
const RUNTIME_EXTERNALS = ["sharp", "file-type", "music-metadata"];
const ENTRIES = { migrate: "scripts/migrate.ts", publish: "scripts/publish.ts", maintain: "scripts/maintain.ts", moderate: "scripts/moderate.ts", clients: "scripts/clients.ts", worker: "scripts/worker.ts", "media-single-copy": "scripts/media-single-copy.ts", "backup-offsite": "scripts/backup-offsite.ts", "media-audit": "scripts/media-audit.ts" };

for (const [name, entry] of Object.entries(ENTRIES)) {
  await build({
    entryPoints: [path.join(ROOT, entry)],
    outfile: path.join(ROOT, "dist", `${name}.mjs`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    alias: { "@": path.join(ROOT, "src") },
    ["external"]: ["pg-native", ...RUNTIME_EXTERNALS],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "warning",
  });
  console.log(`built dist/${name}.mjs`);
}
