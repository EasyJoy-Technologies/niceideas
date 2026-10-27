import { randomUUID } from "node:crypto";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { clearCookie } from "@/server/http/cookies";
import { readRawBody } from "@/server/http/read-json";
import { countryFromHeaders, decideAccess, logRegionDecision } from "@/server/region/region-policy";
import { seeOther } from "@/server/auth/web/redirect";
import { SESSION_COOKIE } from "@/server/auth/web/session";
import { safeNext } from "@/server/auth/web/settings";
import { redeemAppTicket, type ExchangeResult } from "./redeem";
import { requestSite } from "./request-site";

/** `ticket` (43 characters) + `next` (≤ 512) fit easily. */
const MAX_FORM_BYTES = 4096;
const FORM_TYPE = "application/x-www-form-urlencoded";

type TicketForm = { ticket: string | null; next: string | null };

/** Form body (Android WebView posts may lack `Content-Type`: then it is read as a form too); null when unusable. */
async function readTicketForm(request: Request, type: string | null): Promise<TicketForm | null> {
  if (type !== null && type !== FORM_TYPE) return null;
  try {
    const form = new URLSearchParams(Buffer.from(await readRawBody(request, MAX_FORM_BYTES)).toString("utf8"));
    return { ticket: form.get("ticket"), next: form.get("next") };
  } catch {
    return null;
  }
}

/**
 * POST /auth/app-ticket (contract niceideas-share.md §10.3): an app's WebView redeems a one-time ticket
 * and lands on `next` signed in. The answer is always 303 to `next` (a same-site path, else home) and
 * never cached; a failed exchange lands there signed out. Open in mainland China (access class `app_sign_in`).
 * Logged: outcome and the request's site headers by category — never the ticket.
 */
export async function exchangeAppTicket(request: Request): Promise<Response> {
  const cfg = getConfig();
  const path = new URL(request.url).pathname;
  logRegionDecision(path, "app_sign_in", decideAccess({ country: countryFromHeaders(request.headers), access: "app_sign_in", mode: cfg.REGION_POLICY_CN }));
  const site = requestSite(request.headers, new URL(cfg.PUBLIC_BASE_URL).origin);
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || null;
  const form = await readTicketForm(request, type);
  const next = safeNext(form?.next);
  let result: ExchangeResult | "cross_site" | "error" = "cross_site";
  let cookies: string[] = [];
  // Another site's submission: no exchange and the current session stays as it is.
  if (!site.crossSite) {
    try {
      ({ result, cookies } = await redeemAppTicket(getDb(), form?.ticket ?? null, request.headers));
    } catch (err) {
      // Whose session the browser holds is unknown: it ends here (the stored one expires on its own).
      console.error(`[auth] app ticket exchange failed errorId=${randomUUID()}`, err);
      result = "error";
      cookies = [clearCookie(SESSION_COOKIE)];
    }
  }
  const contentType = type === null ? "absent" : type === FORM_TYPE ? "form" : "other";
  console.info(JSON.stringify({ event: "app_ticket", action: "exchange", result, fetchSite: site.fetchSite, origin: site.origin, contentType }));
  return seeOther(next, cookies);
}
