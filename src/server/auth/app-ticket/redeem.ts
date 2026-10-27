import { lockAuthor } from "@/server/accounts/author-gate";
import type { Db } from "@/server/db/client";
import { clearCookie } from "@/server/http/cookies";
import { SSO_TRIED_COOKIE } from "@/server/auth/web/sign-in-flow";
import { endSession, startOrKeepAppSession } from "@/server/auth/web/session";
import { redeemTicket } from "./ticket";

/** Outcome categories (logged; never the ticket). */
export type ExchangeResult = "ok" | "kept" | "switched" | "expired" | "used" | "unknown" | "inactive";
export type Redeemed = { result: ExchangeResult; cookies: string[] };

/**
 * Redeems an app's ticket (contract §10.3) in one transaction: the ticket is used up, the account is
 * share-locked and must be active (a deletion request cannot slip in between), then the browser gets
 * a session of that user (an existing one of the same user is kept). Any failure ends the browser's
 * current session, so the previous account never stays signed in inside the app's WebView.
 */
export async function redeemAppTicket(db: Db, ticket: string | null, headers: Headers): Promise<Redeemed> {
  return db.transaction().execute(async (trx): Promise<Redeemed> => {
    const use = await redeemTicket(trx, ticket);
    const state = use.state === "unexpired" ? await lockAuthor(trx, use.userId) : null;
    if (use.state !== "unexpired" || state !== "active") {
      const { setCookie } = await endSession(trx, headers);
      return { result: use.state === "unexpired" ? "inactive" : use.state, cookies: [setCookie] };
    }
    const session = await startOrKeepAppSession(trx, headers, use.userId);
    // Signed in now: forget an earlier "silent sign-in already tried" mark, as the web sign-in does.
    return { result: session.result, cookies: [...(session.setCookie ? [session.setCookie] : []), clearCookie(SSO_TRIED_COOKIE)] };
  });
}
