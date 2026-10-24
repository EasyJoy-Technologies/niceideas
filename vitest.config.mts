import path from "node:path";
import { defineConfig } from "vitest/config";

// Some tests talk to local stand-in servers: never send those through a proxy configured in the
// environment (read by Node at startup, so it must be set before the test processes start).
process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests start a disposable PostgreSQL container.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
