import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { REGION_BLOCK_HEADER, REGION_PAGE, SITE_PATH_EXCLUSIONS } from "./src/server/region/region-header";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  // Native / binary-heavy packages stay third-party to the server bundle.
  serverExternalPackages: ["sharp", "pg", "music-metadata", "file-type"],
  // Path-only rewrites (internal by construction). They run after src/proxy.ts.
  async rewrites() {
    return {
      beforeFiles: [
        // Mainland-China visitors of site pages get the 451 page (marker set by src/proxy.ts).
        { source: `/:path(${SITE_PATH_EXCLUSIONS}.*)`, has: [{ type: "header", key: REGION_BLOCK_HEADER }], destination: REGION_PAGE },
        // Public profiles: `/@handle` is served by /u/<handle> (an "@" folder would be a parallel route).
        { source: "/@:handle", destination: "/u/:handle" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
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
