import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { insertWebTicket, consumeWebTicket, type TicketUse } from "@/server/db/repos/web-tickets";

/**
 * One-time sign-in tickets for app WebViews (contract niceideas-share.md §10.2): 256 random bits
 * (base64url, 43 characters), valid 60 seconds, redeemed once, bound to one user. Only the SHA-256
 * is stored; the ticket itself is never logged.
 */
export const TICKET_TTL_SECONDS = 60;
export const APP_TICKET_PATH = "/auth/app-ticket";
const TICKET = /^[A-Za-z0-9_-]{43}$/;

const hashOf = (ticket: string) => createHash("sha256").update(ticket).digest("base64url");

/** Where the app redeems a ticket (this deployment's site). */
export const appTicketExchangeUrl = () => `${getConfig().PUBLIC_BASE_URL.replace(/\/$/, "")}${APP_TICKET_PATH}`;

/** Issues a ticket for an existing profile; call after the account was found active. */
export async function issueTicket(db: Db, userId: string): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = await insertWebTicket(db, { idHash: hashOf(ticket), userId, ttlSeconds: TICKET_TTL_SECONDS });
  return { ticket, expiresAt };
}

/** Redeems a ticket (malformed → `unknown` without a database call). */
export async function redeemTicket(db: Db, ticket: string | null): Promise<TicketUse> {
  return ticket && TICKET.test(ticket) ? consumeWebTicket(db, hashOf(ticket)) : { state: "unknown" };
}
