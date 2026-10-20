/** Internal request header set by src/proxy.ts on blocked site pages (consumed by next.config.ts rewrites). */
export const REGION_BLOCK_HEADER = "x-ni-region-blocked";

/** Internal target of blocked page requests. */
export const REGION_PAGE = "/status/region";

/**
 * Paths src/proxy.ts runs on (site pages), as a lookahead body. Shared by the
 * proxy matcher (a literal there; equality is tested) and the 451 rewrite, so a
 * forged marker on other paths (e.g. /p/…) is never acted on.
 */
export const SITE_PATH_EXCLUSIONS = "(?!api/|p/|status/|_next/|media-local/|brand/|styles/|scripts/|fonts/|favicon\\.ico|robots\\.txt)";
