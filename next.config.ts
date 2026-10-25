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
  // Static files (public/): every /styles and /scripts reference carries ?v=<version> (asset() in
  // src/server/share/document.ts), so those URLs never change content; font files are never edited
  // in place. Brand images can change under the same name: one day.
  async headers() {
    const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    const versioned = [{ type: "query" as const, key: "v" }];
    return [
      // Every response: HTTPS only from now on (browsers ignore it over plain http, e.g. local dev).
      { source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }, { key: "X-Content-Type-Options", value: "nosniff" }] },
      { source: "/styles/:file*", has: versioned, headers: immutable },
      { source: "/scripts/:file*", has: versioned, headers: immutable },
      { source: "/fonts/:file*", headers: immutable },
      { source: "/brand/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
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
