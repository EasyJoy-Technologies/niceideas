import { randomInt } from "node:crypto";

/** Unambiguous lowercase alphabet (no 0/o/1/l/i). 14 chars ≈ 70 bits: not enumerable (plan §5, §11). */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const SLUG_LENGTH = 14;
export const SLUG_PATTERN = /^[a-z2-9]{12,32}$/;

export function generateSlug(): string {
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
