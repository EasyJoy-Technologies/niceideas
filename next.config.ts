import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  // Native / binary-heavy packages stay third-party to the server bundle.
  serverExternalPackages: ["sharp", "pg", "music-metadata", "file-type"],
  // Dynamic fs paths in the media pipeline make the tracer pull in repo files; none are needed at runtime.
  outputFileTracingExcludes: { "/*": ["./docs/**/*", "./tests/**/*", "./src/**/*", "./changelog/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
