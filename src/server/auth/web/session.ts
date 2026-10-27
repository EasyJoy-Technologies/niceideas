import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { Profile, SessionSource } from "@/server/db/schema";
import { deleteSession, findLiveSessionUser, findSessionProfile, insertSession, touchSession } from "@/server/db/repos/sessions";
import { clearCookie, readCookie, serializeCookie } from "@/server/http/cookies";

/** Web session cookie: random 256-bit id; the database keeps only its SHA-256. */
export const SESSION_COOKIE = "ni_sid";
const DAY = 86_400_000;
const SID = /^[A-Za-z0-9_-]{43}$/;

const hashOf = (sid: string) => createHash("sha256").update(sid).digest("base64url");
const lifetimeMs = () => getConfig().WEB_SESSION_DAYS * DAY;

/** Hash of the request's (well-formed) session cookie, or null. */
function requestSessionHash(headers: Headers): string | null {
  const sid = readCookie(headers.get("cookie"), SESSION_COOKIE);
  return sid && SID.test(sid) ? hashOf(sid) : null;
}

/** Creates a session; returns its Set-Cookie value. */
export async function startSession(db: Db, userId: string, source: SessionSource = "web"): Promise<string> {
  const sid = randomBytes(32).toString("base64url");
  await insertSession(db, { idHash: hashOf(sid), userId, expiresAt: new Date(Date.now() + lifetimeMs()), source });
  return serializeCookie(SESSION_COOKIE, sid, { maxAge: Math.floor(lifetimeMs() / 1000) });
}

/** `kept`: the request already had a live session of this user; `switched`: another session was ended first. */
export type AppSessionResult = { result: "ok" | "kept" | "switched"; setCookie: string | null };

/**
 * Session for an app's sign-in ticket (contract §10.3): a live session of the same user is kept as it is;
 * any other session of the request ends and a new `app` session starts. Run inside the ticket's transaction.
 */
export async function startOrKeepAppSession(db: Db, headers: Headers, userId: string): Promise<AppSessionResult> {
  const idHash = requestSessionHash(headers);
  if (idHash && (await findLiveSessionUser(db, idHash)) === userId) return { result: "kept", setCookie: null };
  const ended = idHash ? await deleteSession(db, idHash) : null;
  return { result: ended ? "switched" : "ok", setCookie: await startSession(db, userId, "app") };
}

/** Signed-in profile of the request (sliding expiry, refreshed at most daily), or null. */
export async function sessionProfile(db: Db, headers: Headers): Promise<Profile | null> {
  const idHash = requestSessionHash(headers);
  if (!idHash) return null;
  const found = await findSessionProfile(db, idHash);
  if (!found) return null;
  if (Date.now() - found.lastSeenAt.getTime() > DAY) await touchSession(db, idHash, new Date(Date.now() + lifetimeMs()));
  return found.profile;
}

/** Deletes the request's session; returns the cookie-clearing Set-Cookie value and where the session came from. */
export async function endSession(db: Db, headers: Headers): Promise<{ setCookie: string; source: SessionSource | null }> {
  const idHash = requestSessionHash(headers);
  const source = idHash ? await deleteSession(db, idHash) : null;
  return { setCookie: clearCookie(SESSION_COOKIE), source };
}
