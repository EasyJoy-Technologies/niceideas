import { createHmac, randomBytes } from "node:crypto";
import { getConfig } from "@/server/config/env";

/** Long-lived random browser id (no personal data); only its keyed hash is stored. */
export const VISITOR_COOKIE = "ni_vid";
const VISITOR_MAX_AGE = 400 * 86_400;
const VID = /^[A-Za-z0-9_-]{22}$/;
const DEV_SECRET = "niceideas-development-only-interaction-secret";

function secret(): string {
  return getConfig().INTERACTION_SECRET ?? DEV_SECRET;
}

function keyed(kind: string, value: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${value}`).digest("base64url").slice(0, 32);
}

function cookieValue(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Visitor of an interaction request: hashed browser id and network address. */
export type Visitor = {
  /** `v:<hash>` of the browser cookie (stable across visits). */
  key: string;
  ipHash: string;
  /** Set when the cookie had to be issued; the response must carry it. */
  setCookie: string | null;
};

/** Real client address: Cloudflare header first, then the nginx-provided one. */
export function clientIp(headers: Headers): string {
  return (headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

export function ipHash(headers: Headers): string {
  return keyed("ip", clientIp(headers));
}

/** Reads the visitor without issuing a cookie (page rendering). */
export function peekVisitorKey(headers: Headers): string | null {
  const vid = cookieValue(headers.get("cookie"), VISITOR_COOKIE);
  return vid && VID.test(vid) ? `v:${keyed("vid", vid)}` : null;
}

export function visitorOf(request: Request): Visitor {
  let vid = cookieValue(request.headers.get("cookie"), VISITOR_COOKIE);
  let setCookie: string | null = null;
  if (!vid || !VID.test(vid)) {
    vid = randomBytes(16).toString("base64url");
    const secure = new URL(getConfig().PUBLIC_BASE_URL).protocol === "https:" ? "; Secure" : "";
    setCookie = `${VISITOR_COOKIE}=${vid}; Path=/; Max-Age=${VISITOR_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
  }
  return { key: `v:${keyed("vid", vid)}`, ipHash: ipHash(request.headers), setCookie };
}

/** Cookie-authenticated writes must come from our own pages (CSRF guard). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(getConfig().PUBLIC_BASE_URL).origin;
}
