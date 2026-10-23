import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Handles that can never be claimed (routes, brand, staff impersonation). */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin", "administrator", "api", "app", "about", "account", "auth", "explore", "discover", "help",
  "home", "login", "logout", "me", "media", "moderator", "notifications", "niceideas", "nicematrix", "nicenote",
  "official", "p", "post", "posts", "privacy", "root", "search", "settings", "signup", "staff",
  "status", "support", "system", "terms", "timeline", "u", "user", "users", "www",
]);

/**
 * Lowercased NiceMatrix username: 1–64 of a-z, 0-9, underscore and dot (Logto allows up to 128).
 * Dots only ("." / "..") are refused: they are URL path segments.
 */
export const HANDLE_PATTERN = /^(?!\.+$)[a-z0-9_.]{1,64}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle);
}

/** NiceMatrix (Logto) user id → handle (lowercased); null when it cannot be one. Used while the user has no username. */
export function handleFromUserId(userId: string): string | null {
  const h = userId.toLowerCase();
  return isValidHandle(h) ? h : null;
}

/** True for a handle made by generateHandle() (never chosen by the user). */
export function isGeneratedHandle(handle: string): boolean {
  return new RegExp(`^u[${ALPHABET}]{9}$`).test(handle);
}

/** Random, unguessable fallback handle such as `u7k2mfq9xa` (user may change it later). */
export function generateHandle(): string {
  let out = "u";
  for (let i = 0; i < 9; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
