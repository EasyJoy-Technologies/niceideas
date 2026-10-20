import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/server/config/env";

/**
 * Proof of work for anonymous comments (plan §16.2: no third-party captcha script).
 * Stateless signed challenges; the client finds a nonce such that
 * sha256(`${challenge}:${nonce}`) starts with `bits` zero bits. Used challenges
 * are remembered in-process until they expire (single-use).
 */
const TTL_MS = 10 * 60_000;
const used = new Map<string, number>();

const sign = (payload: string) => createHmac("sha256", getConfig().INTERACTION_SECRET ?? "dev-pow").update(`pow:${payload}`).digest("base64url").slice(0, 22);

export function issueChallenge(now = Date.now()): { challenge: string; bits: number } {
  const payload = `${(now + TTL_MS).toString(36)}.${randomBytes(9).toString("base64url")}`;
  return { challenge: `${payload}.${sign(payload)}`, bits: getConfig().COMMENT_POW_BITS };
}

function leadingZeroBits(buf: Buffer): number {
  let n = 0;
  for (const byte of buf) {
    if (byte === 0) { n += 8; continue; }
    return n + Math.clz32(byte) - 24;
  }
  return n;
}

export function verifyProof(challenge: string, nonce: string, now = Date.now()): boolean {
  const parts = challenge.split(".");
  if (parts.length !== 3 || !/^[0-9a-z]{1,12}$/.test(nonce)) return false;
  const [exp, rand, mac] = parts;
  const expected = Buffer.from(sign(`${exp}.${rand}`));
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), expected)) return false;
  const expiresAt = parseInt(exp, 36);
  if (!(expiresAt > now) || used.has(challenge)) return false;
  if (leadingZeroBits(createHash("sha256").update(`${challenge}:${nonce}`).digest()) < getConfig().COMMENT_POW_BITS) return false;
  for (const [c, at] of used) if (at <= now) used.delete(c);
  used.set(challenge, expiresAt);
  return true;
}
