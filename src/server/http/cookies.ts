import { getConfig } from "@/server/config/env";

/** Value of one request cookie (URL-decoded), or null. */
export function readCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

export type CookieOptions = { maxAge: number; path?: string; httpOnly?: boolean };

/** `Set-Cookie` value: SameSite=Lax, Secure on https deployments, HttpOnly unless disabled. */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const secure = new URL(getConfig().PUBLIC_BASE_URL).protocol === "https:" ? "; Secure" : "";
  const httpOnly = opts.httpOnly === false ? "" : "; HttpOnly";
  return `${name}=${encodeURIComponent(value)}; Path=${opts.path ?? "/"}; Max-Age=${opts.maxAge}${httpOnly}; SameSite=Lax${secure}`;
}

export const clearCookie = (name: string, path = "/") => serializeCookie(name, "", { maxAge: 0, path });
