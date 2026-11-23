import path from "node:path";
import { defineConfig } from "vitest/config";

const ROOT = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root: ROOT,
  resolve: { alias: { "@": path.join(ROOT, "src") } },
  test: { environment: "node", include: ["var/bulk-admin/**/*.test.ts"], testTimeout: 300_000, hookTimeout: 300_000 },
});
