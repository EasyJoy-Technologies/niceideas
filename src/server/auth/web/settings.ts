import { safeRedirectPath } from "@/server/http/safe-path";
import { getConfig } from "@/server/config/env";

export type WebAuthSettings = { issuer: string; clientId: string; clientSecret: string; baseUrl: string };

/** Web sign-in settings, or null when the Logto web app is not configured (sign-in disabled). */
export function webAuthSettings(): WebAuthSettings | null {
  const cfg = getConfig();
  if (!cfg.LOGTO_WEB_APP_ID || !cfg.LOGTO_WEB_APP_SECRET) return null;
  return {
    issuer: cfg.LOGTO_WEB_ISSUER ?? cfg.LOGTO_ISSUER,
    clientId: cfg.LOGTO_WEB_APP_ID,
    clientSecret: cfg.LOGTO_WEB_APP_SECRET,
    baseUrl: cfg.PUBLIC_BASE_URL.replace(/\/$/, ""),
  };
}

export const CALLBACK_PATH = "/auth/callback";

/** Only same-site relative paths are accepted as post-sign-in targets. */
export function safeNext(raw: string | null | undefined): string {
  const path = safeRedirectPath(raw);
  return path.startsWith("/auth/") ? "/" : path;
}
