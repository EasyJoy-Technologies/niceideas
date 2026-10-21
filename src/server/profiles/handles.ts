import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Handles that can never be claimed (routes, brand, staff impersonation). */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin", "administrator", "api", "app", "about", "account", "auth", "explore", "discover", "help",
  "home", "login", "logout", "me", "media", "moderator", "notifications", "niceideas", "nicematrix", "nicenote",
  "official", "p", "post", "posts", "privacy", "root", "search", "settings", "signup", "staff",
  "status", "support", "system", "terms", "timeline", "u", "user", "users", "www",
]);

export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle);
}

/** Random, unguessable default handle such as `u7k2mfq9xa` (user may change it later). */
export function generateHandle(): string {
  let out = "u";
  for (let i = 0; i < 9; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
