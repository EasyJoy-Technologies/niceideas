import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { Profile } from "@/server/db/schema";
import { deleteSession, findSessionProfile, insertSession, touchSession } from "@/server/db/repos/sessions";
import { clearCookie, readCookie, serializeCookie } from "@/server/http/cookies";

/** Web session cookie: random 256-bit id; the database keeps only its SHA-256. */
export const SESSION_COOKIE = "ni_sid";
const DAY = 86_400_000;
const SID = /^[A-Za-z0-9_-]{43}$/;

const hashOf = (sid: string) => createHash("sha256").update(sid).digest("base64url");
const lifetimeMs = () => getConfig().WEB_SESSION_DAYS * DAY;

/** Creates a session; returns its Set-Cookie value. */
export async function startSession(db: Db, userId: string): Promise<string> {
  const sid = randomBytes(32).toString("base64url");
  await insertSession(db, { idHash: hashOf(sid), userId, expiresAt: new Date(Date.now() + lifetimeMs()) });
  return serializeCookie(SESSION_COOKIE, sid, { maxAge: Math.floor(lifetimeMs() / 1000) });
}

/** Signed-in profile of the request (sliding expiry, refreshed at most daily), or null. */
export async function sessionProfile(db: Db, headers: Headers): Promise<Profile | null> {
  const sid = readCookie(headers.get("cookie"), SESSION_COOKIE);
  if (!sid || !SID.test(sid)) return null;
  const idHash = hashOf(sid);
  const found = await findSessionProfile(db, idHash);
  if (!found) return null;
  if (Date.now() - found.lastSeenAt.getTime() > DAY) await touchSession(db, idHash, new Date(Date.now() + lifetimeMs()));
  return found.profile;
}

/** Deletes the request's session; returns the cookie-clearing Set-Cookie value. */
export async function endSession(db: Db, headers: Headers): Promise<string> {
  const sid = readCookie(headers.get("cookie"), SESSION_COOKIE);
  if (sid && SID.test(sid)) await deleteSession(db, hashOf(sid));
  return clearCookie(SESSION_COOKIE);
}
